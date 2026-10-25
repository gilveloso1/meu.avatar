import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { createStudio } from "../src/index";
import { estimateCost, validate, verifySignature } from "../src/openrouter";
import { buildPrompt, cleanSpeech, LANGUAGES, qualityGuide, SPEECH_LEAD, STYLES } from "../src/prompt";
import { MOTION_GUIDE, VOICES } from "../src/structures/heygen";
import { call, cookie, FakeAudioApi, FakeVideoApi, memberCookie, postForm, SITE, sign, WAN } from "./helpers";

const FALA = "Oi, gente! Hoje eu vou mostrar como eu faço meus vídeos.";
const PEDIDO = { estilo: "selfie", idioma: "pt-BR", fala: FALA };

async function post(api: FakeVideoApi, fields: Record<string, string | File>, structure = "wan", audio: FakeAudioApi | null = null) {
  return call(postForm(`/novo/${structure}`, fields, { cookie: await cookie() }), api, audio);
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

  it("com login, mostra os vídeos e o botão de novo vídeo", async () => {
    const res = await get("/");
    const page = await res.text();
    expect(res.status).toBe(200);
    expect(page).toContain("Nenhum vídeo ainda");
    expect(page).toContain('<a class="extended-fab interactive" href="/novo">');
  });

  it("o formulário do Wan vem com os padrões e o custo", async () => {
    const res = await get("/novo/wan");
    const page = await res.text();
    expect(res.status).toBe(200);
    expect(page).toContain('<option value="25" selected>25 s</option>');
    expect(page).toContain('value="480p" checked');
    expect(page).toContain('<option value="9:16" selected>');
    expect(page).toContain("duration_seconds_480p");
    expect(page).toContain("US$ 1.25");
  });

  it("sem chave do OpenRouter, avisa e desliga o botão", async () => {
    const page = await (await get("/novo/wan", undefined, null)).text();
    expect(page).toContain("OPENROUTER_API_KEY");
    expect(page).toContain('type="submit" disabled');
  });

  it("o administrador escolhe entre o Wan e o HeyGen", async () => {
    const page = await (await get("/novo")).text();
    expect(page).toContain('href="/novo/wan"');
    expect(page).toContain('href="/novo/heygen"');
    expect(page).toContain("Em teste: só o administrador vê");
  });

  it("estrutura que não existe dá 404", async () => {
    expect((await get("/novo/inventada")).status).toBe(404);
  });
});

describe("acesso negado à estrutura em teste", () => {
  it("conta comum não vê o HeyGen na escolha", async () => {
    const page = await (await get("/novo", await memberCookie())).text();
    expect(page).toContain('href="/novo/wan"');
    expect(page).not.toContain("/novo/heygen");
  });

  it("conta comum não abre o formulário do HeyGen", async () => {
    expect((await get("/novo/heygen", await memberCookie())).status).toBe(404);
  });

  it("conta comum não gera vídeo pelo HeyGen, mesmo mandando o formulário direto", async () => {
    const api = new FakeVideoApi();
    const foto = new File([new Uint8Array([1, 2, 3])], "eu.jpg", { type: "image/jpeg" });
    const res = await call(postForm("/novo/heygen", { fala: FALA, voz: VOICES[0]!.value, imagem: foto }, { cookie: await memberCookie() }), api);
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
    expect(res.headers.get("location")).toBe("/");

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

    const page = await (await call(new Request(`${SITE}/`, { headers: { cookie: await cookie() } }), api)).text();
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
    const page = await (await call(new Request(`${SITE}/`, { headers: { cookie: await cookie() } }), api)).text();
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
    let page = await (await call(new Request(`${SITE}/`, { headers: { cookie: await cookie() } }), api, audio)).text();
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

    page = await (await call(new Request(`${SITE}/`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).not.toContain("data-refresh=");
    expect(page).toContain(`/videos/${video.id}.original.mp4?baixar`);
  });

  it("se o contêiner falhar, o vídeo continua com o original e o motivo aparece", async () => {
    const audio = new FakeAudioApi();
    audio.fail = "Tratamento do áudio falhou (HTTP 500): ffmpeg";
    const { api, studio } = await prontoParaTratar(audio);
    const video = (await studio.treatNextAudio())!;
    expect(video).toMatchObject({ audio_status: "failed", processed_key: null, audio_error: "Tratamento do áudio falhou (HTTP 500): ffmpeg" });
    const page = await (await call(new Request(`${SITE}/`, { headers: { cookie: await cookie() } }), api, audio)).text();
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
    const page = await (await get("/novo/heygen")).text();
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

    const home = await (await get("/", undefined, api)).text();
    expect(home).toContain("HeyGen Avatar IV");
    expect(home).toContain("≈ 5 s");
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
