import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { createStudio } from "../src/index";
import { estimateCost, validate, verifySignature } from "../src/openrouter";
import { buildPrompt, cleanSpeech, LANGUAGES, qualityGuide, SPEECH_LEAD, STYLES } from "../src/prompt";
import { planParts, RULES } from "../src/quickedit";
import { MOTION_GUIDE, VOICES } from "../src/structures/heygen";
import { call, cookie, FakeAudioApi, FakeVideoApi, memberCookie, postForm, SITE, sign, WAN } from "./helpers";

const FALA = "Oi, gente! Hoje eu vou mostrar como eu faço meus vídeos.";
const PEDIDO = { estilo: "selfie", idioma: "pt-BR", fala: FALA };

async function post(api: FakeVideoApi, fields: Record<string, string | File>, structure = "wan", audio: FakeAudioApi | null = null) {
  return call(postForm(`/modelo/${structure}`, fields, { cookie: await cookie() }), api, audio);
}

const get = async (path: string, session?: string, api: FakeVideoApi | null = new FakeVideoApi()) =>
  call(new Request(`${SITE}${path}`, { headers: { cookie: session ?? (await cookie()) } }), api);

describe("openrouter", () => {
  it("valida contra o que o modelo aceita e estima o custo", () => {
    expect(validate(WAN, { model: WAN.id, prompt: "x", duration: 25, resolution: "480p", aspect_ratio: "9:16" })).toEqual([]);
    expect(validate(WAN, { model: WAN.id, prompt: "x", duration: 40, resolution: "4K", aspect_ratio: "9:16" })).toHaveLength(2);
    expect(estimateCost(WAN, { model: WAN.id, prompt: "x", duration: 25, resolution: "480p" })).toBeCloseTo(1.25);
  });

  it("confere a assinatura do webhook", async () => {
    const body = '{"a":1}';
    expect(await verifySignature(body, await sign(body), "segredo-webhook")).toBe(true);
    expect(await verifySignature(body, await sign(body, "outro"), "segredo-webhook")).toBe(false);
    expect(await verifySignature(body, await sign(body, "segredo-webhook", 1000), "segredo-webhook")).toBe(false);
    expect(await verifySignature(body, null, "segredo-webhook")).toBe(false);
  });
});

describe("acesso", () => {
  it("sem login, manda para /entrar", async () => {
    const res = await call(new Request(`${SITE}/`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar");
  });

  it("com login, a tela inicial mostra os cards dos modelos, com a contagem de vídeos", async () => {
    const res = await get("/");
    const page = await res.text();
    expect(res.status).toBe(200);
    expect(page).toContain('href="/modelo/wan"');
    expect(page).toContain("0 vídeos");
    expect(page).toContain("<title>Meu Avatar</title>");
  });

  it("os endereços antigos levam às páginas novas", async () => {
    expect((await get("/novo")).headers.get("location")).toBe("/");
    expect((await get("/novo/wan")).headers.get("location")).toBe("/modelo/wan");
  });

  it("o formulário do Wan vem com os padrões e o custo", async () => {
    const res = await get("/modelo/wan");
    const page = await res.text();
    expect(res.status).toBe(200);
    expect(page).toContain('<option value="25" selected>25 s</option>');
    expect(page).toContain('value="480p" checked');
    expect(page).toContain('<option value="9:16" selected>');
    expect(page).toContain("duration_seconds_480p");
    expect(page).toContain("US$ 1.25");
  });

  it("sem chave do OpenRouter, avisa e desliga o botão", async () => {
    const page = await (await get("/modelo/wan", undefined, null)).text();
    expect(page).toContain("OPENROUTER_API_KEY");
    expect(page).toContain('type="submit" disabled');
  });

  it("o administrador escolhe entre o Wan e o HeyGen", async () => {
    const page = await (await get("/")).text();
    expect(page).toContain('href="/modelo/wan"');
    expect(page).toContain('href="/modelo/heygen"');
    expect(page).toContain("Em teste: só o administrador vê");
  });

  it("estrutura que não existe dá 404", async () => {
    expect((await get("/modelo/inventada")).status).toBe(404);
  });
});

describe("telas", () => {
  it("a busca da tela inicial filtra os modelos pelo nome", async () => {
    const page = await (await get("/?q=wan")).text();
    expect(page).toContain('href="/modelo/wan"');
    expect(page).not.toContain('href="/modelo/heygen"');
    expect(await (await get("/?q=nada")).text()).toContain("Nenhum modelo encontrado");
  });

  it("a página de vídeos junta os modelos, filtra por status e pela fala, e abre na página do modelo", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { ...PEDIDO, fala: "Promoção de verão" });
    api.finish("job-1", { status: "failed", error: "Content policy violation" });
    await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen();
    const [verao, oi] = await new Db(env.DB).recentVideos();

    const page = await (await get("/videos", undefined, api)).text();
    expect(page).toContain(`href="/modelo/wan?video=${verao!.id}"`);
    expect(page).toContain(`href="/modelo/wan?video=${oi!.id}"`);
    expect(page).toContain("data-refresh=");

    const erro = await (await get("/videos?status=erro", undefined, api)).text();
    expect(erro).toContain(oi!.id);
    expect(erro).not.toContain(verao!.id);
    expect(erro).not.toContain("data-refresh=");

    const busca = await (await get("/videos?q=ver%C3%A3o&ver=lista", undefined, api)).text();
    expect(busca).toContain(verao!.id);
    expect(busca).not.toContain(oi!.id);
    expect(busca).toContain('class="list-row interactive"');
    // Trocar o filtro guarda a busca e a vista.
    expect(busca).toContain('href="/videos?q=ver%C3%A3o&amp;status=prontos&amp;ver=lista"');

    // O menu do card do modelo leva aos vídeos só dele.
    expect(await (await get("/", undefined, api)).text()).toContain('href="/videos?modelo=wan"');
    expect(await (await get("/videos?modelo=heygen", undefined, api)).text()).not.toContain(oi!.id);
  });

  it("a página do modelo mostra o vídeo escolhido; sem vídeos, a apresentação e as falas prontas", async () => {
    const vazia = await (await get("/modelo/wan")).text();
    expect(vazia).toContain("Comece por uma fala pronta");
    expect(vazia).toContain("data-fill=");

    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { ...PEDIDO, fala: "Segundo vídeo" });
    const [segundo, primeiro] = await new Db(env.DB).recentVideos();
    // Sem ?video=, o mais novo; com ele, o escolhido, marcado na lista.
    expect(await (await get("/modelo/wan", undefined, api)).text()).toContain(`id="detalhes-${segundo!.id}"`);
    const page = await (await get(`/modelo/wan?video=${primeiro!.id}`, undefined, api)).text();
    expect(page).toContain(`id="detalhes-${primeiro!.id}"`);
    expect(page).not.toContain(`id="detalhes-${segundo!.id}"`);
    expect(page).toContain(`href="/modelo/wan?video=${primeiro!.id}" aria-current="true"`);
    expect(page).toContain(`data-fill="${FALA}"`);
    expect(page).not.toContain("Comece por uma fala pronta");
  });
});

describe("acesso negado à estrutura em teste", () => {
  it("conta comum não vê o HeyGen na escolha", async () => {
    const page = await (await get("/", await memberCookie())).text();
    expect(page).toContain('href="/modelo/wan"');
    expect(page).not.toContain("/modelo/heygen");
  });

  it("conta comum não vê os vídeos do HeyGen na página de vídeos", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { fala: FALA, voz: VOICES[0]!.value, imagem: new File([new Uint8Array([1])], "eu.png", { type: "image/png" }) }, "heygen");
    const [heygen, wan] = await new Db(env.DB).recentVideos();
    expect(heygen!.structure).toBe("heygen");
    const member = await memberCookie();
    const page = await (await get("/videos", member, api)).text();
    expect(page).toContain(wan!.id);
    expect(page).not.toContain(heygen!.id);
    expect(await (await get("/videos", undefined, api)).text()).toContain(heygen!.id);
    // Nem pedindo só os do HeyGen.
    expect(await (await get("/videos?modelo=heygen", member, api)).text()).not.toContain(heygen!.id);
  });

  it("o id de um vídeo do HeyGen não abre na página do Wan", async () => {
    const api = new FakeVideoApi();
    await post(api, { fala: FALA, voz: VOICES[0]!.value, imagem: new File([new Uint8Array([1])], "eu.png", { type: "image/png" }) }, "heygen");
    const [heygen] = await new Db(env.DB).recentVideos();
    const page = await (await get(`/modelo/wan?video=${heygen!.id}`, await memberCookie(), api)).text();
    expect(page).not.toContain(heygen!.id);
    expect(page).not.toContain(FALA);
  });

  it("conta comum não abre o formulário do HeyGen", async () => {
    expect((await get("/modelo/heygen", await memberCookie())).status).toBe(404);
  });

  it("conta comum não gera vídeo pelo HeyGen, mesmo mandando o formulário direto", async () => {
    const api = new FakeVideoApi();
    const foto = new File([new Uint8Array([1, 2, 3])], "eu.jpg", { type: "image/jpeg" });
    const res = await call(postForm("/modelo/heygen", { fala: FALA, voz: VOICES[0]!.value, imagem: foto }, { cookie: await memberCookie() }), api);
    expect(res.status).toBe(404);
    expect(api.submitted).toHaveLength(0);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("o estúdio também confere o acesso, fora do site", async () => {
    const { ForbiddenError } = await import("../src/studio");
    const { HEYGEN_AVATAR } = await import("../src/structures/heygen");
    const api = new FakeVideoApi();
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio: null });
    await expect(studio.create({ structure: HEYGEN_AVATAR, values: () => "", user: { id: 1, role: "member" } })).rejects.toBeInstanceOf(ForbiddenError);
    expect(api.submitted).toHaveLength(0);
  });
});

describe("prompt", () => {
  it("a fala vira uma linha só, sem as aspas de fora e com as de dentro trocadas", () => {
    expect(cleanSpeech(' "Oi,\n  gente!  Ele disse "olá" pra mim." ')).toBe("Oi, gente! Ele disse 'olá' pra mim.");
  });

  it("o idioma escolhido vai na orientação de qualidade; sem instruções, nada de linha vazia", () => {
    const prompt = buildPrompt({ style: STYLES[1]!, language: LANGUAGES[2]!, speech: "Hola" });
    expect(prompt).toBe(`${STYLES[1]!.direction}\n${SPEECH_LEAD} "Hola"\n\n${qualityGuide(LANGUAGES[2]!)}`);
    expect(prompt).toContain("Latin American Spanish");
    expect(prompt).not.toContain("Brazilian Portuguese");
  });

  it("cada estilo e a orientação ficam curtos (prompt de até ~200 tokens)", () => {
    const words = (t: string) => t.split(/\s+/).length;
    for (const style of STYLES) expect(words(style.direction)).toBeLessThanOrEqual(60);
    expect(words(qualityGuide(LANGUAGES[0]!))).toBeLessThanOrEqual(90);
    // Falar baixo é pedido no verbo da fala e na orientação de áudio.
    expect(SPEECH_LEAD).toMatch(/softly.*low voice/);
    expect(qualityGuide(LANGUAGES[0]!)).toMatch(/low volume[\s\S]*never raising the voice/);
  });
});

describe("gerar vídeo", () => {
  it("guarda a foto, envia o pedido com primeiro quadro e callback", async () => {
    const api = new FakeVideoApi();
    const foto = new File([new Uint8Array([1, 2, 3])], "eu.jpg", { type: "image/jpeg" });
    const res = await post(api, { ...PEDIDO, instrucoes: "ela sorri no final", imagem: foto, duracao: "25", resolucao: "480p", formato: "9:16" });
    expect(res.status).toBe(303);
    const [criado] = await new Db(env.DB).recentVideos();
    expect(res.headers.get("location")).toBe(`/modelo/wan?video=${criado!.id}`);

    const [req] = api.submitted;
    expect(req!.input_references).toBeUndefined();
    expect(req!.provider).toBeUndefined();
    // Estilo, instruções, fala entre aspas e a orientação fixa de qualidade no fim.
    expect(req!.prompt).toBe(
      `${STYLES[0]!.direction}\nela sorri no final\n${SPEECH_LEAD} "${FALA}"\n\n${qualityGuide(LANGUAGES[0]!)}`,
    );
    expect(req).toMatchObject({ model: "alibaba/wan-3.0", duration: 25, resolution: "480p", aspect_ratio: "9:16", generate_audio: true });
    expect(req!.callback_url).toBe(`${SITE}/openrouter/webhook`);
    const imageUrl = req!.frame_images![0]!.image_url.url;
    expect(imageUrl).toMatch(new RegExp(`^${SITE}/midia/avatares/[0-9a-f-]{36}\\.jpg$`));

    // A foto fica pública para o provedor baixar, sem login.
    const foto2 = await call(new Request(imageUrl));
    expect(foto2.status).toBe(200);
    expect(foto2.headers.get("content-type")).toBe("image/jpeg");

    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({
      job_id: "job-1", status: "pending", duration: 25, prompt: FALA, request_prompt: req!.prompt,
      style: "selfie", language: "pt-BR", extra: "ela sorri no final", structure: "wan", settings: null,
    });
  });

  it("sem foto, vai só o texto", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    expect(api.submitted[0]!.frame_images).toBeUndefined();
  });

  it("recusa fala vazia, estilo ou idioma fora da lista, duração fora do modelo e arquivo que não é imagem", async () => {
    const api = new FakeVideoApi();
    const casos: Record<string, string | File>[] = [
      { ...PEDIDO, fala: ' "" ' },
      { ...PEDIDO, estilo: "inventado" },
      { ...PEDIDO, idioma: "klingon" },
      { ...PEDIDO, duracao: "45" },
      { ...PEDIDO, imagem: new File(["x"], "a.gif", { type: "image/gif" }) },
    ];
    for (const fields of casos) {
      const res = await post(api, fields);
      // Volta ao formulário, com o motivo e o que já estava escrito.
      expect(res.status).toBe(400);
      const page = await res.text();
      expect(page).toContain('role="alert"');
      if (fields.fala === FALA) expect(page).toContain(`>${FALA}</textarea>`);
    }
    expect(api.submitted).toHaveLength(0);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("se o OpenRouter recusar, o vídeo fica como falhou, com o motivo", async () => {
    const api = new FakeVideoApi();
    api.failSubmit = "OpenRouter respondeu HTTP 402: sem créditos";
    await post(api, PEDIDO);
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ status: "failed", error: "OpenRouter respondeu HTTP 402: sem créditos" });
  });
});

describe("acompanhar", () => {
  it("webhook assinado: confere na API, guarda o MP4 no R2 e mostra o player", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    api.finish("job-1", { status: "completed", usage: { cost: 1.25 } });

    // O corpo do aviso diz "failed", mas quem manda é a API.
    const body = JSON.stringify({ type: "video.generation.completed", data: { id: "job-1", status: "failed" } });
    const res = await call(
      new Request(`${SITE}/openrouter/webhook`, { method: "POST", body, headers: { "X-OpenRouter-Signature": await sign(body) } }),
      api,
    );
    expect(res.status).toBe(200);

    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ status: "completed", cost: 1.25, video_key: `videos/${video!.id}.mp4` });
    expect(await (await env.MIDIA.get(video!.video_key!))!.text()).toBe("mp4-falso");

    const page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api)).text();
    expect(page).toContain(`<video controls preload="metadata" playsinline src="/videos/${video!.id}.mp4">`);
    expect(page).toContain("US$ 1.25");
    expect(page).not.toContain('data-refresh=');

    const mp4 = await call(new Request(`${SITE}/videos/${video!.id}.mp4`, { headers: { cookie: await cookie(), range: "bytes=0-2" } }), api);
    expect(mp4.status).toBe(206);
    expect(new TextDecoder().decode(await mp4.arrayBuffer())).toBe("mp4");
    expect((await call(new Request(`${SITE}/videos/${video!.id}.mp4`), api)).status).toBe(303);
  });

  it("webhook sem assinatura válida é recusado", async () => {
    const api = new FakeVideoApi();
    const body = JSON.stringify({ data: { id: "job-1" } });
    const res = await call(new Request(`${SITE}/openrouter/webhook`, { method: "POST", body, headers: { "X-OpenRouter-Signature": "t=1,v1=00" } }), api);
    expect(res.status).toBe(401);
  });

  it("agendamento confere os abertos e registra a falha", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, PEDIDO);
    api.finish("job-1", { status: "in_progress" });
    api.finish("job-2", { status: "failed", error: "Content policy violation" });

    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio: null });
    await studio.syncOpen();
    const byJob = Object.fromEntries((await new Db(env.DB).recentVideos()).map((v) => [v.job_id, v]));
    expect(byJob["job-1"]!.status).toBe("in_progress");
    expect(byJob["job-2"]).toMatchObject({ status: "failed", error: "Content policy violation" });

    // Enquanto há vídeo na fila, a página se atualiza sozinha.
    const page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api)).text();
    expect(page).toContain('data-refresh=');
    expect(page).toContain("Content policy violation");

    // Terminado, não consulta mais.
    api.finish("job-1", { status: "completed" });
    await studio.syncOpen();
    await studio.syncOpen();
    expect(api.downloads).toBe(1);
  });
});

describe("domínio", () => {
  it("www vai para o domínio sem www, com o mesmo caminho", async () => {
    const { handle } = await import("../src/index");
    const res = await handle(new Request("https://www.meuavatar.ia.br/entrar?x=1"), { ...env, SITE_URL: "https://meuavatar.ia.br" }, { api: null });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://meuavatar.ia.br/entrar?x=1");
  });
});

describe("tratamento do áudio", () => {
  async function prontoParaTratar(audio: FakeAudioApi) {
    const api = new FakeVideoApi();
    await post(api, { estilo: "selfie", idioma: "pt-BR", fala: "Oi" }, "wan", audio);
    api.finish("job-1", { status: "completed", usage: { cost: 1.06 } });
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio });
    await studio.syncOpen();
    return { api, studio };
  }

  it("o vídeo pronto entra na fila; o agendamento trata e guarda a versão tratada ao lado do original", async () => {
    const audio = new FakeAudioApi();
    const { api, studio } = await prontoParaTratar(audio);
    let [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ status: "completed", audio_status: "pending", processed_key: null });

    // Enquanto trata, o cartão avisa e a página continua se atualizando.
    let page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).toContain("Tratando áudio");
    expect(page).toContain("data-refresh=");

    video = (await studio.treatNextAudio())!;
    expect(video).toMatchObject({ audio_status: "done", processed_key: `videos/${video.id}.tratado.mp4` });
    expect(await (await env.MIDIA.get(video.processed_key!))!.text()).toBe("mp4-falso+tratado");
    expect(await studio.treatNextAudio()).toBeNull();
    expect(audio.calls).toBe(1);

    // /videos/<id>.mp4 é o tratado; o original continua em .original.mp4.
    const session = await cookie();
    const tratado = await call(new Request(`${SITE}/videos/${video.id}.mp4`, { headers: { cookie: session } }), api, audio);
    expect(await tratado.text()).toBe("mp4-falso+tratado");
    const original = await call(new Request(`${SITE}/videos/${video.id}.original.mp4?baixar`, { headers: { cookie: session } }), api, audio);
    expect(await original.text()).toBe("mp4-falso");
    expect(original.headers.get("content-disposition")).toContain("-original.mp4");

    page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).not.toContain("data-refresh=");
    expect(page).toContain(`/videos/${video.id}.original.mp4?baixar`);
  });

  it("se o contêiner falhar, o vídeo continua com o original e o motivo aparece", async () => {
    const audio = new FakeAudioApi();
    audio.fail = "Tratamento do áudio falhou (HTTP 500): ffmpeg";
    const { api, studio } = await prontoParaTratar(audio);
    const video = (await studio.treatNextAudio())!;
    expect(video).toMatchObject({ audio_status: "failed", processed_key: null, audio_error: "Tratamento do áudio falhou (HTTP 500): ffmpeg" });
    const page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).toContain("Áudio não tratado: Tratamento do áudio falhou");
    const mp4 = await call(new Request(`${SITE}/videos/${video.id}.mp4`, { headers: { cookie: await cookie() } }), api, audio);
    expect(await mp4.text()).toBe("mp4-falso");
  });

  it("tratamento que não termina em 20 minutos vira falha", async () => {
    const audio = new FakeAudioApi();
    const { studio } = await prontoParaTratar(audio);
    const db = new Db(env.DB);
    const inicio = new Date("2026-10-25T12:00:00Z");
    const [pendente] = await db.recentVideos();
    await db.claimAudio(inicio.toISOString());
    expect(await db.claimAudio(inicio.toISOString())).toBeNull(); // ninguém pega o mesmo vídeo duas vezes
    await studio.treatNextAudio(new Date(inicio.getTime() + 21 * 60_000));
    expect(await db.videoById(pendente!.id)).toMatchObject({ audio_status: "failed", audio_error: "O tratamento do áudio não terminou a tempo." });
  });

  it("sem contêiner, o vídeo fica como veio, sem fila", async () => {
    const api = new FakeVideoApi();
    await post(api, { estilo: "selfie", idioma: "pt-BR", fala: "Oi" });
    api.finish("job-1", { status: "completed" });
    await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen();
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ status: "completed", audio_status: null });
  });
});

describe("HeyGen Avatar IV", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });

  it("o formulário tem voz, expressividade e movimento, sem duração", async () => {
    const page = await (await get("/modelo/heygen")).text();
    expect(page).toContain('name="voz"');
    expect(page).toContain('name="expressividade" value="low" checked');
    expect(page).toContain('name="movimento"');
    expect(page).toContain('value="720p" checked');
    expect(page).not.toContain('name="duracao"');
    expect(page).toMatch(/<input type="file" name="imagem"[^>]* required/);
  });

  it("manda a fala como prompt, a foto como referência e a voz nas opções da HeyGen", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { fala: FALA, voz: VOICES[1]!.value, expressividade: "medium", movimento: "aponta para a câmera", resolucao: "720p", formato: "9:16", imagem: foto() }, "heygen");
    expect(res.status).toBe(303);

    const [req] = api.submitted;
    expect(req).toMatchObject({ model: "heygen/avatar-iv", prompt: FALA, resolution: "720p", aspect_ratio: "9:16" });
    expect(req!.duration).toBeUndefined();
    expect(req!.generate_audio).toBeUndefined();
    expect(req!.frame_images).toBeUndefined();
    expect(req!.input_references![0]!.image_url.url).toMatch(new RegExp(`^${SITE}/midia/avatares/[0-9a-f-]{36}\\.png$`));
    expect(req!.provider).toEqual({
      options: { heygen: { voice_id: VOICES[1]!.value, expressiveness: "medium", motion_prompt: `${MOTION_GUIDE} aponta para a câmera` } },
    });

    // O vídeo fica ligado à estrutura, com as configurações dela.
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "heygen", model: "heygen/avatar-iv", prompt: FALA, extra: "aponta para a câmera", style: null });
    expect(JSON.parse(video!.settings!)).toMatchObject({ voice_id: VOICES[1]!.value, expressiveness: "medium" });
    // Duração estimada pela fala (11 palavras a 2,4 por segundo).
    expect(video!.duration).toBe(5);

    // Fica na página do HeyGen, não na do Wan, com os detalhes no "Ver mais".
    const page = await (await get("/modelo/heygen", undefined, api)).text();
    expect(page).toContain("≈ 5 s");
    expect(page).toContain(`data-dialog-open="detalhes-${video!.id}"`);
    expect(page).toContain("<dt>Voz</dt><dd>Orus · masculina · multilíngue</dd>");
    expect(page).toContain("<dt>Expressividade</dt><dd>Média</dd>");
    expect(await (await get("/modelo/wan", undefined, api)).text()).not.toContain(video!.id);
    expect(await (await get("/", undefined, api)).text()).toContain("1 vídeo");
  });

  it("sem foto, sem voz da lista ou com expressividade inventada, não manda nada", async () => {
    const api = new FakeVideoApi();
    const casos: Record<string, string | File>[] = [
      { fala: FALA },
      { fala: FALA, imagem: foto(), voz: "voz-inventada" },
      { fala: FALA, imagem: foto(), expressividade: "extrema" },
      { fala: " ", imagem: foto() },
      { fala: FALA, imagem: foto(), formato: "4:3" },
    ];
    for (const fields of casos) expect((await post(api, fields, "heygen")).status).toBe(400);
    expect(api.submitted).toHaveLength(0);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("pronto, o vídeo não passa pelo tratamento de áudio", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await post(api, { fala: FALA, imagem: foto() }, "heygen", audio);
    api.finish("job-1", { status: "completed", usage: { cost: 0.25 } });
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio });
    await studio.syncOpen();
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ status: "completed", audio_status: null, cost: 0.25 });
    expect(await studio.treatNextAudio()).toBeNull();
    expect(audio.calls).toBe(0);
  });
});

describe("edição rápida", () => {
  const BOTAO = 'type="button" data-qe-open>';
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });

  async function pronto(structure: "heygen" | "wan", audio: FakeAudioApi | null = new FakeAudioApi()) {
    const api = new FakeVideoApi();
    await post(api, structure === "heygen" ? { fala: FALA, imagem: foto() } : PEDIDO, structure, audio);
    api.finish("job-1", { status: "completed", usage: { cost: 0.25 } });
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio });
    await studio.syncOpen();
    const [video] = await new Db(env.DB).recentVideos();
    return { api, audio, studio, video: video! };
  }

  const pedir = async (id: string, api: FakeVideoApi, audio: FakeAudioApi | null, session?: string, fields: Record<string, string> = {}) =>
    call(postForm(`/videos/${id}/edicao-rapida`, fields, { cookie: session ?? (await cookie()) }), api, audio);

  it("o botão abre a prévia no vídeo pronto do HeyGen; o agendamento edita com os trechos dela e o player mostra a editada", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    const session = await cookie();
    let page = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).toContain(`action="/videos/${video.id}/edicao-rapida"`);
    expect(page).toContain(BOTAO);
    expect(page).toContain("data-quick-edit=");
    expect(page).toMatch(/name="pausa" value="media" form="edicao-rapida"[^>]* checked/);
    expect(page).toMatch(/name="camera" value="close" form="edicao-rapida"[^>]* checked/);
    expect(page).toContain("Gerar vídeo editado");
    // A explicação da opção escolhida aparece embaixo de cada ajuste.
    expect(page).toContain('data-help-for="pausa">Respiro curto entre as frases.');
    expect(page).toContain('data-help-for="camera">Como o Zoom, mas de vez em quando chega bem perto do rosto.');

    const trechos = [[0.42, 7.417, 1], [7.928, 10.91, 1.25]];
    const res = await pedir(video.id, api, audio, session, { pausa: "longa", camera: "zoom", trechos: JSON.stringify(trechos) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/modelo/heygen?video=${video.id}`);
    page = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).toContain("Editando o vídeo");
    expect(page).toContain('class="work-notice"');
    expect(page).toContain("Enquanto isso, o player mostra o original.");
    expect(page).toContain("data-refresh=");
    expect(page).not.toContain(BOTAO);
    // Pedir de novo enquanto está na fila não duplica.
    expect((await pedir(video.id, api, audio, session)).status).toBe(400);

    const editado = (await studio.editNext())!;
    expect(editado).toMatchObject({ edit_status: "done", edited_key: `videos/${video.id}.editado.mp4` });
    expect(await studio.editNext()).toBeNull();
    expect(audio!.edits).toBe(1);
    expect(audio!.plans).toEqual([{ pausa: 0.35, zooms: [1, 1.25], trechos }]);

    const mp4 = await call(new Request(`${SITE}/videos/${video.id}.editado.mp4?baixar`, { headers: { cookie: session } }), api, audio);
    expect(await mp4.text()).toBe("mp4-falso+editado");
    expect(mp4.headers.get("content-disposition")).toContain("-editado.mp4");
    page = await (await call(new Request(`${SITE}/modelo/heygen?video=${video.id}`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).toContain(`src="/videos/${video.id}.editado.mp4"`);
    expect(page).toContain("Ver original");
    page = await (await call(new Request(`${SITE}/modelo/heygen?video=${video.id}&original`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).toContain(`src="/videos/${video.id}.mp4"`);
    expect(page).toContain("Ver editado");
    // Editado, dá para refazer com outras escolhas; sem os trechos da prévia, o contêiner acha os silêncios.
    expect(page).toContain(BOTAO);
    expect((await pedir(video.id, api, audio, session, { pausa: "curta", camera: "parada" })).status).toBe(303);
    await studio.editNext();
    expect(audio!.plans[1]).toEqual({ pausa: 0.1, zooms: [1] });
  });

  it("o rosto é achado pelo contêiner na primeira vez, fica guardado e vai no plano da edição", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    const session = await cookie();
    const rosto = () => call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: session } }), api, audio);
    let res = await rosto();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ x: 0.46, y: 0.44, altura: 0.25 });
    res = await rosto();
    expect(await res.json()).toEqual({ x: 0.46, y: 0.44, altura: 0.25 });
    expect(audio!.faces).toBe(1);
    expect(await new Db(env.DB).videoById(video.id)).toMatchObject({ face: JSON.stringify({ x: 0.46, y: 0.44, altura: 0.25 }) });

    await pedir(video.id, api, audio, session, { pausa: "media", camera: "close" });
    await studio.editNext();
    expect(audio!.plans[0]).toEqual({ pausa: 0.2, zooms: [1, 1.25, 1, 1.5], rosto: { x: 0.46, y: 0.44 } });
  });

  it("sem rosto achado, a resposta é vazia e o plano vai sem rosto (o contêiner tenta de novo)", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    audio!.faceFound = {};
    const res = await call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: await cookie() } }), api, audio);
    expect(await res.json()).toEqual({});
    await pedir(video.id, api, audio);
    await studio.editNext();
    expect(audio!.plans[0]).not.toHaveProperty("rosto");
  });

  it("conta comum não pede o rosto de um vídeo do HeyGen", async () => {
    const { api, audio, video } = await pronto("heygen");
    const res = await call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: await memberCookie() } }), api, audio);
    expect(res.status).toBe(403);
    expect(audio!.faces).toBe(0);
  });

  it("sem login, o rosto manda para /entrar", async () => {
    const { api, audio, video } = await pronto("heygen");
    const res = await call(new Request(`${SITE}/videos/${video.id}/rosto`), api, audio);
    expect(res.headers.get("location")).toBe("/entrar");
    expect(audio!.faces).toBe(0);
  });

  it("o Wan não tem rosto para a edição rápida", async () => {
    const { api, audio, video } = await pronto("wan");
    const res = await call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: await cookie() } }), api, audio);
    expect(res.status).toBe(400);
    expect(audio!.faces).toBe(0);
  });

  it("plano inválido não entra na fila", async () => {
    const { api, audio, video } = await pronto("heygen");
    const casos: Record<string, string>[] = [
      { pausa: "enorme" },
      { camera: "drone" },
      { trechos: "não é json" },
      { trechos: "[]" },
      { trechos: JSON.stringify([[2, 1, 1]]) },
      { trechos: JSON.stringify([[0, 2, 3]]) },
      { trechos: JSON.stringify([[0, 2, 1], [1, 3, 1]]) },
      { trechos: JSON.stringify(Array.from({ length: 201 }, (_, i) => [i, i + 0.5, 1])) },
    ];
    for (const fields of casos) expect((await pedir(video.id, api, audio, undefined, fields)).status).toBe(400);
    expect(await new Db(env.DB).videoById(video.id)).toMatchObject({ edit_status: null });
  });

  it("se o contêiner falhar, o motivo aparece e o botão volta", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    await pedir(video.id, api, audio);
    audio!.fail = "Edição rápida falhou (HTTP 500): ffmpeg";
    expect(await studio.editNext()).toMatchObject({ edit_status: "failed", edited_key: null });
    const page = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).toContain("Edição rápida falhou: Edição rápida falhou (HTTP 500)");
    expect(page).toContain(BOTAO);
  });

  it("edição que não termina em 20 minutos vira falha", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    await pedir(video.id, api, audio);
    const db = new Db(env.DB);
    const inicio = new Date("2026-10-27T12:00:00Z");
    await db.claimEdit(inicio.toISOString());
    expect(await db.claimEdit(inicio.toISOString())).toBeNull();
    await studio.editNext(new Date(inicio.getTime() + 21 * 60_000));
    expect(await db.videoById(video.id)).toMatchObject({ edit_status: "failed", edit_error: "A edição rápida não terminou a tempo." });
  });

  it("o Wan não tem edição rápida: sem botão e recusada mesmo mandando direto", async () => {
    const { api, audio, studio, video } = await pronto("wan");
    await studio.treatNextAudio();
    const page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).not.toContain(BOTAO);
    expect(page).not.toContain("/edicao-rapida");
    expect(page).not.toContain("const planParts");
    expect((await pedir(video.id, api, audio)).status).toBe(400);
    expect(await studio.editNext()).toBeNull();
  });

  it("vídeo que ainda não ficou pronto não é editado", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await post(api, { fala: FALA, imagem: foto() }, "heygen", audio);
    const [video] = await new Db(env.DB).recentVideos();
    expect((await pedir(video!.id, api, audio)).status).toBe(400);
    expect(await new Db(env.DB).videoById(video!.id)).toMatchObject({ edit_status: null });
  });

  it("conta comum não pede a edição rápida de um vídeo do HeyGen", async () => {
    const { api, audio, video } = await pronto("heygen");
    const res = await pedir(video.id, api, audio, await memberCookie());
    expect(res.status).toBe(403);
    expect(await new Db(env.DB).videoById(video.id)).toMatchObject({ edit_status: null });
  });

  it("sem login, a edição rápida manda para /entrar", async () => {
    const { api, audio, video } = await pronto("heygen");
    const res = await call(postForm(`/videos/${video.id}/edicao-rapida`, {}), api, audio);
    expect(res.headers.get("location")).toBe("/entrar");
    expect(await new Db(env.DB).videoById(video.id)).toMatchObject({ edit_status: null });
  });

  it("formulário de outro site não pede a edição", async () => {
    const { api, audio, video } = await pronto("heygen");
    const req = new Request(`${SITE}/videos/${video.id}/edicao-rapida`, { method: "POST", headers: { origin: "https://outro.site", cookie: await cookie() } });
    expect((await call(req, api, audio)).status).toBe(403);
  });

  it("sem contêiner, a edição é recusada", async () => {
    const { api, video } = await pronto("heygen", null);
    expect((await pedir(video.id, api, null)).status).toBe(400);
  });
});

describe("ritmo orgânico da edição rápida", () => {
  // Falas (início, fim) viram silêncios entre elas, num vídeo de `fim` segundos.
  const silencios = (falas: number[][], fim: number) => {
    const out: number[][] = [];
    let t = 0;
    for (const [a, b] of falas) {
      if (a! > t) out.push([t, a!]);
      t = b!;
    }
    if (fim > t) out.push([t, fim]);
    return out;
  };
  // Quanto de pausa sobrou entre o trecho k e o k+1.
  const sobra = (parts: number[][], falas: number[][], k: number) => parts[k]![1]! - falas[k]![1]! + (falas[k + 1]![0]! - parts[k + 1]![0]!);

  it("a pausa que sobra segue a original: a longa continua maior que a curta, e as duas encurtam", () => {
    const falas = [[0.5, 4], [4.4, 8], [9.2, 12.5], [12.9, 16]];
    const parts = planParts(silencios(falas, 16.5), 16.5, 0.2, [1], RULES);
    expect(parts).toHaveLength(4);
    const curta = sobra(parts, falas, 0), longa = sobra(parts, falas, 1);
    expect(longa).toBeGreaterThan(curta);
    expect(longa).toBeLessThan(1.2);
    expect(curta).toBeLessThan(0.4);
  });

  it("fala curta de um dos lados ganha pausa extra", () => {
    const longas = [[0.5, 4], [4.4, 8], [8.4, 12]];
    const comCurta = [[0.5, 4], [4.4, 5.1], [5.5, 9]];
    const normal = sobra(planParts(silencios(longas, 12.5), 12.5, 0.2, [1], RULES), longas, 0);
    const curta = sobra(planParts(silencios(comCurta, 9.5), 9.5, 0.2, [1], RULES), comCurta, 0);
    expect(curta).toBeGreaterThan(normal + 0.05);
  });

  it("quando quase nada sairia, não corta: a pausa fica inteira", () => {
    const falas = [[0.5, 4], [4.3, 8]];
    const parts = planParts(silencios(falas, 8.5), 8.5, 0.35, [1], RULES);
    expect(parts).toHaveLength(1);
  });

  it("a câmera só troca depois de 2,5 s no mesmo enquadramento", () => {
    const falas = [[0.5, 1.6], [2.2, 3.3], [3.9, 5], [5.6, 6.7], [7.3, 8.4], [9, 10.1]];
    const parts = planParts(silencios(falas, 10.5), 10.5, 0.2, [1, 1.25], RULES);
    expect(parts.length).toBeGreaterThan(3);
    let desde = 0;
    parts.forEach((p, k) => {
      if (k > 0 && p[2] !== parts[k - 1]![2]) {
        expect(desde).toBeGreaterThanOrEqual(RULES.minShot);
        desde = 0;
      }
      desde += p[1] - p[0];
    });
    expect(parts.some((p, k) => k > 0 && p[2] === parts[k - 1]![2])).toBe(true);
  });

  it("a função vai inteira no script da prévia: roda igual fora dela", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await post(api, { fala: FALA, imagem: new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" }) }, "heygen", audio);
    api.finish("job-1", { status: "completed" });
    await createStudio({ ...env, SITE_URL: SITE }, { api, audio }).syncOpen();
    const page = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: await cookie() } }), api, audio)).text();
    const source = /const planParts = ([\s\S]*?);\n {2}const qe = /.exec(page)?.[1];
    expect(source).toBeTruthy();
    const copia = new Function(`return (${source})`)() as typeof planParts;
    const falas = [[0.5, 4], [4.4, 5.1], [5.5, 9], [10, 12]];
    expect(copia(silencios(falas, 12.5), 12.5, 0.2, [1, 1.25, 1, 1.5], RULES)).toEqual(planParts(silencios(falas, 12.5), 12.5, 0.2, [1, 1.25, 1, 1.5], RULES));
  });
});
