import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type User } from "../src/db";
import { ERROS } from "../src/erros";
import { createStudio } from "../src/index";
import { LIST_PAGE } from "../src/site/site";
import { OPEN_TIMEOUT_MS } from "../src/studio";
import { estimateCost, validate, verifySignature } from "../src/openrouter";
import { buildPrompt, cleanSpeech, LANGUAGES, qualityGuide, SPEECH_LEAD, STYLES } from "../src/prompt";
import { planParts, RULES } from "../src/quickedit";
import { mp4Duration } from "../src/mp4";
import { billedSeconds, estimate, structureById } from "../src/structures";
import { MOTION_GUIDE, VOICES } from "../src/structures/heygen";
import { ALEPH, alephPrompt, aspectLabel, CHECK_MODEL, FACE_MODEL, keyframeTimes, parseCheck } from "../src/structures/aleph";
import { FLUX_EDIT } from "../src/structures/flux";
import { GROK, GROK_GUIDE } from "../src/structures/grok";
import { MISCHIEF, MISCHIEF_GUIDE } from "../src/structures/mischief";
import { MAX_OMNI_SPEECH, NO_SPEECH, OMNI, OMNI_11, OMNI_SILENT, OMNI_SILENT_GUIDE, OMNI_SINGLE_SHOT, omniTalkPrompt } from "../src/structures/omni";
import { IMAGE_GUIDE, IMAGE_REFERENCE_GUIDE, NANO_BANANA } from "../src/structures/imagem";
import { outputSeconds, SEEDANCE as SEEDANCE_STRUCTURE, swapPrompt } from "../src/structures/seedance";
import { SEEDANCE_LIVRE } from "../src/structures/seedance-livre";
import { ALEPH_MODEL, BANANA_MODEL, FLUX_EDIT_MODEL, GROK_MODEL, MISCHIEF_MODEL, OMNI_11_MODEL, OMNI_MODEL, call, cookie, FakeAudioApi, FakeVideoApi, fakeMp4, dono, memberCookie, postForm, SEEDANCE, SITE, sign, WAN } from "./helpers";

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
    expect(page).toContain(ERROS.criacaoPausadaAviso);
    expect(page).not.toContain("OPENROUTER_API_KEY");
    expect(page).toContain('type="submit" disabled');
  });

  it("o administrador escolhe entre o Wan e o HeyGen", async () => {
    const page = await (await get("/")).text();
    expect(page).toContain('href="/modelo/wan"');
    expect(page).toContain('href="/modelo/heygen"');
    expect(page).toContain("Em teste: só quem testa vê");
  });

  it("estrutura que não existe dá 404", async () => {
    expect((await get("/modelo/inventada")).status).toBe(404);
  });
});

describe("agendamento", () => {
  it("um vídeo que falha ao baixar não para a conferência dos outros", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { ...PEDIDO, fala: "Promoção de verão" });
    api.finish("job-1", { status: "completed" });
    api.finish("job-2", { status: "completed" });
    const baixar = api.download.bind(api);
    let primeiro = true;
    api.download = async (job) => {
      if (primeiro) {
        primeiro = false;
        throw new Error("download caiu");
      }
      return baixar(job);
    };
    const feitos = await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen();
    expect(feitos.map((v) => v.status)).toEqual(["completed"]);
    // O que falhou continua aberto e fecha na rodada seguinte.
    expect((await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen()).map((v) => v.status)).toEqual(["completed"]);
  });
  it("a fila roda: dez presos no começo não seguram os mais novos", async () => {
    const api = new FakeVideoApi();
    for (const fala of ["Um", "Dois", "Três"]) await post(api, { ...PEDIDO, fala });
    // Os dois mais antigos seguem na fila do provedor; só o terceiro ficou pronto.
    api.finish("job-3", { status: "completed" });
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio: null });
    expect((await studio.syncOpen(2)).map((v) => v.status)).toEqual(["pending", "pending"]);
    // A rodada seguinte começa por quem ainda não foi conferido.
    expect((await studio.syncOpen(2)).map((v) => v.status)).toContain("completed");
    // Conferir não conta como mudança do vídeo.
    const abertos = () => env.DB.prepare("SELECT id, updated_at, checked_at FROM videos WHERE status = 'pending' ORDER BY id").all<{ id: string; updated_at: string; checked_at: string | null }>();
    const antes = (await abertos()).results;
    await studio.syncOpen(2, new Date(Date.now() + 60_000));
    const depois = (await abertos()).results;
    expect(depois).toHaveLength(2);
    expect(depois.map((v) => v.updated_at)).toEqual(antes.map((v) => v.updated_at));
    expect(depois.map((v) => v.checked_at)).not.toEqual(antes.map((v) => v.checked_at));
  });

  it("vídeo aberto há horas vira falha e sai da fila; o recente segue", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { ...PEDIDO, fala: "Promoção de verão" });
    const [novo, velho] = await new Db(env.DB).recentVideos();
    const agora = Date.now();
    await env.DB.prepare("UPDATE videos SET created_at = ? WHERE id = ?").bind(new Date(agora - OPEN_TIMEOUT_MS - 60_000).toISOString(), velho!.id).run();
    await env.DB.prepare("UPDATE videos SET created_at = ? WHERE id = ?").bind(new Date(agora - OPEN_TIMEOUT_MS + 60_000).toISOString(), novo!.id).run();
    const feitos = await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen(10, new Date(agora));
    expect(feitos.find((v) => v.id === velho!.id)).toMatchObject({ status: "failed", error: ERROS.videoDemorou });
    expect(feitos.find((v) => v.id === novo!.id)).toMatchObject({ status: "pending", error: null });
    // Falhou de vez: o provedor responder depois não reabre.
    api.finish(velho!.job_id!, { status: "completed" });
    expect((await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen(10, new Date(agora))).map((v) => v.id)).toEqual([novo!.id]);
    expect((await new Db(env.DB).videoById(velho!.id))!.status).toBe("failed");
  });
});

describe("custo estimado contra o que o provedor cobra", () => {
  it("o Wan cobra no mínimo 5 s: o vídeo de 3 s custa o de 5", () => {
    for (const id of ["wan", "wan-livre"]) {
      const custo = (duracao: string, resolucao = "480p") => estimate(structureById(id)!, WAN, (n) => ({ duracao, resolucao })[n] ?? "");
      expect(custo("3")).toBeCloseTo(0.25);
      expect(custo("5")).toBeCloseTo(0.25);
      expect(custo("6")).toBeCloseTo(0.3);
      expect(custo("4", "720p")).toBeCloseTo(0.5);
    }
  });

  it("sem regra de cobrança, os segundos são os do vídeo", () => {
    expect(billedSeconds(GROK.cost, 3)).toBe(3);
    expect(billedSeconds(OMNI.cost, 15)).toBe(15);
  });
});

describe("telas", () => {
  it("a busca da tela inicial filtra os modelos pelo nome", async () => {
    const page = await (await get("/?q=wan")).text();
    expect(page).toContain('href="/modelo/wan"');
    expect(page).not.toContain('href="/modelo/heygen"');
    expect(await (await get("/?q=nada")).text()).toContain("Nenhum modelo encontrado");
  });

  it("as listas vêm em páginas, com o total no contador e a paginação no fim", async () => {
    await get("/");
    const db = new Db(env.DB);
    const user = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!.id;
    const TOTAL = LIST_PAGE + 5;
    for (let i = 0; i < TOTAL; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      await db.insertVideo({ id, prompt: i % 2 ? "Promoção de verão" : "Oi, gente", model: WAN.id, duration: 5, resolution: "480p", aspect_ratio: "9:16", image_key: null, user_id: user, request_prompt: "x", style: "selfie", language: "pt-BR", extra: null, structure: "wan", settings: null, avatar_id: null }, new Date(Date.UTC(2026, 10, 1, 0, i)));
    }
    const cards = (html: string) => [...html.matchAll(/class="frame interactive" href="\/video\/([0-9a-f-]+)\?de=([^"]+)"/g)].map((m) => [m[1], decodeURIComponent(m[2]!)]);
    const ultimo = `00000000-0000-4000-8000-${String(TOTAL - 1).padStart(12, "0")}`;

    // /videos: a primeira página tem os mais novos; o contador diz o total, não o que a página mostra.
    const um = await (await get("/videos")).text();
    expect(cards(um)).toHaveLength(LIST_PAGE);
    expect(cards(um)[0]).toEqual([ultimo, "/videos"]);
    expect(um).toContain(`data-library-count data-total="${TOTAL}">${TOTAL}</span>`);
    expect(um).toContain(`<span class="pager__range">1–${LIST_PAGE} de ${TOTAL}</span>`);
    expect(um).toContain('href="/videos?pagina=2" aria-label="Próxima página"');
    expect(um).toMatch(/<span class="icon-button" aria-disabled="true" aria-label="Página anterior">/);

    // A segunda tem o resto, e voltar de um vídeo dela cai nela.
    const dois = await (await get("/videos?pagina=2")).text();
    expect(cards(dois)).toHaveLength(5);
    expect(cards(dois).at(-1)).toEqual(["00000000-0000-4000-8000-000000000000", "/videos?pagina=2"]);
    expect(dois).toContain(`<span class="pager__range">${LIST_PAGE + 1}–${TOTAL} de ${TOTAL}</span>`);
    expect(dois).toContain('href="/videos?pagina=1" aria-label="Página anterior"');
    // Página além da última (ou inválida): a última (ou a primeira), nunca uma lista vazia.
    expect(cards(await (await get("/videos?pagina=99")).text())).toHaveLength(5);
    expect(cards(await (await get("/videos?pagina=abc")).text())).toHaveLength(LIST_PAGE);

    // A busca conta só o que achou, e a paginação leva a busca junto.
    const busca = await (await get("/videos?q=ver%C3%A3o&pagina=1")).text();
    const achados = Math.floor(TOTAL / 2);
    expect(busca).toContain(`data-total="${achados}"`);
    expect(busca).not.toContain('class="pager"');
    await env.DB.prepare("UPDATE videos SET prompt = 'Promoção de verão'").run();
    expect(await (await get("/videos?q=ver%C3%A3o")).text()).toContain('href="/videos?q=ver%C3%A3o&pagina=2"');

    // A página do modelo, igual: o endereço de volta leva a página.
    const modelo = await (await get("/modelo/wan?pagina=2")).text();
    expect(cards(modelo)).toHaveLength(5);
    expect(cards(modelo)[0]![1]).toBe("/modelo/wan?pagina=2");
    expect(modelo).toContain('href="/modelo/wan?pagina=1" aria-label="Página anterior"');
    expect(modelo).toContain(`data-total="${TOTAL}"`);
    expect(cards(await (await get("/modelo/wan")).text())[0]).toEqual([ultimo, "/modelo/wan"]);
    // Lista que cabe numa página não tem paginação.
    await env.DB.prepare("DELETE FROM videos WHERE id > ?").bind(`00000000-0000-4000-8000-${String(LIST_PAGE - 1).padStart(12, "0")}`).run();
    expect(await (await get("/videos")).text()).not.toContain('class="pager"');
  });

  it("a página de vídeos junta os modelos na mesma lista da página do modelo, com busca pela fala, e abre na página do vídeo", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { ...PEDIDO, fala: "Promoção de verão" });
    api.finish("job-1", { status: "failed", error: "Content policy violation" });
    await createStudio({ ...env, SITE_URL: SITE }, { api, audio: null }).syncOpen();
    const [verao, oi] = await new Db(env.DB).recentVideos();

    const page = await (await get("/videos", undefined, api)).text();
    expect(page).toContain('data-library="videos"');
    expect(page).toContain(`href="/video/${verao!.id}?de=%2Fvideos"`);
    // O status vai em cada item: o filtro por status é feito no navegador.
    expect(page).toContain(`data-video="${oi!.id}" data-kind="error"`);
    expect(page).toContain(`data-video="${verao!.id}" data-kind="busy"`);
    expect(page).toContain("data-refresh=");

    const busca = await (await get("/videos?q=ver%C3%A3o", undefined, api)).text();
    expect(busca).toContain(verao!.id);
    expect(busca).not.toContain(oi!.id);
    // A página do vídeo volta para a busca.
    expect(busca).toContain(`href="/video/${verao!.id}?de=%2Fvideos%3Fq%3Dver%25C3%25A3o"`);
    expect(await (await get("/videos?q=nada-disso", undefined, api)).text()).toContain("Nenhum vídeo encontrado");

    // O menu do card do modelo leva aos vídeos só dele.
    expect(await (await get("/", undefined, api)).text()).toContain('href="/videos?modelo=wan"');
    expect(await (await get("/videos?modelo=heygen", undefined, api)).text()).not.toContain(oi!.id);
  });

  it("a página do modelo lista os vídeos dele (os mais novos primeiro) e cada um abre na página do vídeo", async () => {
    const vazia = await (await get("/modelo/wan")).text();
    expect(vazia).toContain("Os vídeos gerados aparecem aqui.");
    expect(vazia).not.toContain('class="library__groups"');

    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    await post(api, { ...PEDIDO, fala: "Segundo vídeo" });
    const [segundo, primeiro] = await new Db(env.DB).recentVideos();
    const page = await (await get("/modelo/wan", undefined, api)).text();
    expect(page).toContain('data-library="wan"');
    expect(page.indexOf(`href="/video/${segundo!.id}?de=%2Fmodelo%2Fwan"`)).toBeLessThan(page.indexOf(`href="/video/${primeiro!.id}?de=%2Fmodelo%2Fwan"`));
    // Vistas (cards em três tamanhos e detalhes), filtro, ordem e agrupar por data.
    for (const view of ["p", "m", "g", "d"]) expect(page).toContain(`data-view="${view}"`);
    expect(page).toContain('data-group-toggle aria-pressed="false"');
    expect(page).toContain('<h3 class="vgroup__title">Hoje</h3>');
    // Sem MP4 ainda, o card mostra o ícone do status no lugar da miniatura.
    expect(page).toContain('<span class="frame__placeholder">');
    expect(page).not.toContain("Comece por uma fala pronta");
  });

  it("Refazer abre o modelo com o texto e os ajustes do vídeo", async () => {
    const api = new FakeVideoApi();
    await post(api, { ...PEDIDO, fala: "Texto para refazer" });
    const [video] = await new Db(env.DB).recentVideos();
    const page = await (await get(`/modelo/wan?refazer=${video!.id}`, undefined, api)).text();
    expect(page).toContain(">Texto para refazer</textarea>");
    // Vídeo de outro modelo não preenche nada.
    expect(await (await get(`/modelo/heygen?refazer=${video!.id}`, undefined, api)).text()).not.toContain("Texto para refazer");
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
    // Os dois da conta comum: o modelo em teste continua de fora, mesmo sendo dela.
    await env.DB.prepare("UPDATE videos SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com')").run();
    const page = await (await get("/videos", member, api)).text();
    expect(page).toContain(wan!.id);
    expect(page).not.toContain(heygen!.id);
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

  it("conta comum não abre a página de um vídeo do HeyGen, nem pedindo o Refazer pelo Wan", async () => {
    const api = new FakeVideoApi();
    await post(api, { fala: FALA, voz: VOICES[0]!.value, imagem: new File([new Uint8Array([1])], "eu.png", { type: "image/png" }) }, "heygen");
    const [heygen] = await new Db(env.DB).recentVideos();
    const member = await memberCookie();
    expect((await get(`/video/${heygen!.id}`, member, api)).status).toBe(404);
    expect((await get(`/video/${heygen!.id}`, undefined, api)).status).toBe(200);
    expect(await (await get(`/modelo/wan?refazer=${heygen!.id}`, member, api)).text()).not.toContain(FALA);
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
    await expect(studio.create({ structure: HEYGEN_AVATAR, values: () => "", user: { id: 1, role: "member", permissoes: [] } })).rejects.toBeInstanceOf(ForbiddenError);
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
      style: "selfie", language: "pt-BR", extra: "ela sorri no final", structure: "wan",
    });
    // A foto entrou como arquivo solto: o vídeo guarda isso para o "Refazer" trazer igual.
    expect(JSON.parse(video!.settings!)).toEqual({ ativo_imagem: expect.stringMatching(/^arquivo:/) });
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

describe("página do vídeo", () => {
  it("sem login manda para /entrar; vídeo que não existe dá 404", async () => {
    expect((await call(new Request(`${SITE}/video/${crypto.randomUUID()}`))).status).toBe(303);
    expect((await get(`/video/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it("a seta e o X voltam para a lista de onde veio, só dentro do site", async () => {
    const api = new FakeVideoApi();
    await post(api, PEDIDO);
    const [video] = await new Db(env.DB).recentVideos();
    const volta = async (de: string) => {
      const page = await (await get(`/video/${video!.id}?de=${encodeURIComponent(de)}`, undefined, api)).text();
      return /data-back="([^"]*)"/.exec(page)?.[1];
    };
    expect(await volta("/videos?q=oi")).toBe("/videos?q=oi");
    // Endereço de outro site (ou //outro) não serve: volta para o modelo do vídeo.
    expect(await volta("//exemplo.com/x")).toBe("/modelo/wan");
    expect(await volta("https://exemplo.com")).toBe("/modelo/wan");
    expect(await (await get(`/video/${video!.id}`, undefined, api)).text()).toContain('data-back="/modelo/wan"');
  });

  it("sem edição rápida (Wan), a folha não tem abas; o texto livre tem bloco próprio só quando preenchido", async () => {
    const api = new FakeVideoApi();
    await post(api, { ...PEDIDO, instrucoes: "olha para a câmera" });
    await post(api, PEDIDO);
    const [semInstrucoes, comInstrucoes] = await new Db(env.DB).recentVideos();
    const com = await (await get(`/video/${comInstrucoes!.id}`, undefined, api)).text();
    expect(com).not.toContain('role="tablist"');
    expect(com).toContain('<h2 class="viewer__title">Instruções extras</h2>');
    expect(com).not.toContain('<dt class="qe-result__label">Instruções extras</dt>');
    const sem = await (await get(`/video/${semInstrucoes!.id}`, undefined, api)).text();
    expect(sem).not.toContain("Instruções extras");
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

    // A página do vídeo: o player com a barra própria (sem os controles do navegador), o custo e o download.
    const page = await (await call(new Request(`${SITE}/video/${video!.id}`, { headers: { cookie: await cookie() } }), api)).text();
    expect(page).toContain(`<video autoplay preload="metadata" playsinline src="/videos/${video!.id}.mp4">`);
    expect(page).toContain("data-vbar");
    expect(page).toContain("US$ 1.25");
    expect(page).toContain(`href="/videos/${video!.id}.mp4?baixar"`);
    expect(page).not.toContain("data-refresh=");
    // Na lista do modelo, a miniatura só baixa quando aparece na tela (data-src).
    const lista = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api)).text();
    expect(lista).toContain(`<video data-src="/videos/${video!.id}.mp4" preload="metadata"`);

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

    // Enquanto há vídeo na fila, a página se atualiza sozinha; o motivo da falha aparece na página do vídeo.
    const page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: await cookie() } }), api)).text();
    expect(page).toContain('data-refresh=');
    const falhou = await (await call(new Request(`${SITE}/video/${byJob["job-2"]!.id}`, { headers: { cookie: await cookie() } }), api)).text();
    // O motivo do provedor fica no banco; a tela mostra a frase do catálogo.
    expect(falhou).toContain(ERROS.videoFalhou);
    expect(falhou).not.toContain("Content policy violation");
    expect(falhou).toContain("status-line--error");

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

  it("o aviso do provedor e o agendamento no mesmo vídeo: só o primeiro fecha, e o áudio é tratado uma vez", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await post(api, { estilo: "selfie", idioma: "pt-BR", fala: "Oi" }, "wan", audio);
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio });
    // As duas conferências leram o vídeo ainda aberto.
    const [aberto] = await new Db(env.DB).recentVideos();
    api.finish("job-1", { status: "completed", usage: { cost: 1.06 } });
    expect(await studio.sync(aberto!)).toMatchObject({ status: "completed", audio_status: "pending" });
    expect(await studio.treatNextAudio()).toMatchObject({ audio_status: "done" });

    // A segunda chega depois: fica o que a primeira gravou, e o áudio não volta para a fila.
    const depois = await studio.sync(aberto!);
    expect(depois).toMatchObject({ status: "completed", audio_status: "done", cost: 1.06 });
    expect(depois.updated_at).toBe((await new Db(env.DB).videoById(aberto!.id))!.updated_at);
    expect(await studio.treatNextAudio()).toBeNull();
    expect(audio.calls).toBe(1);

    // Uma resposta atrasada do provedor ("gerando", ou uma falha) não reabre nem derruba o vídeo pronto.
    for (const status of ["in_progress", "failed"] as const) {
      api.finish("job-1", { status });
      expect(await studio.sync(aberto!)).toMatchObject({ status: "completed", audio_status: "done", error: null });
    }
    expect((await studio.syncOpen()).length).toBe(0);
  });

  it("as duas conferências ao mesmo tempo: o vídeo fecha uma vez", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await post(api, { estilo: "selfie", idioma: "pt-BR", fala: "Oi" }, "wan", audio);
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, audio });
    const [aberto] = await new Db(env.DB).recentVideos();
    api.finish("job-1", { status: "completed", usage: { cost: 1.06 } });
    const [a, b] = await Promise.all([studio.sync(aberto!), studio.sync(aberto!)]);
    expect(a.status).toBe("completed");
    expect(b.status).toBe("completed");
    expect(await studio.treatNextAudio()).toMatchObject({ audio_status: "done" });
    expect(await studio.treatNextAudio()).toBeNull();
  });

  it("o Wan 3.0 livre sem som não entra na fila; com som, entra", async () => {
    for (const [som, esperado] of [["nao", null], ["sim", "pending"]] as const) {
      await env.DB.prepare("DELETE FROM videos").run();
      const api = new FakeVideoApi();
      const audio = new FakeAudioApi();
      await post(api, { cena: "a câmera se aproxima devagar", som, duracao: "5", resolucao: "480p", formato: "9:16" }, "wan-livre", audio);
      expect(api.submitted[0]).toMatchObject({ generate_audio: som === "sim" });
      api.finish("job-1", { status: "completed", usage: { cost: 0.25 } });
      await createStudio({ ...env, SITE_URL: SITE }, { api, audio }).syncOpen();
      const [video] = await new Db(env.DB).recentVideos();
      expect(video).toMatchObject({ structure: "wan-livre", status: "completed", audio_status: esperado });
    }
  });

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
    expect(original.headers.get("content-disposition")).toContain(" (original).mp4");

    page = await (await call(new Request(`${SITE}/modelo/wan`, { headers: { cookie: session } }), api, audio)).text();
    expect(page).not.toContain("data-refresh=");
    // Com o tratado, o "Baixar" vira menu com as duas versões.
    const pagina = await (await call(new Request(`${SITE}/video/${video.id}`, { headers: { cookie: session } }), api, audio)).text();
    expect(pagina).toContain(`/videos/${video.id}.original.mp4?baixar`);
    // "Original" é o do player (com o áudio tratado); o de antes do tratamento tem nome próprio.
    expect(pagina).toContain(`href="/videos/${video.id}.mp4?baixar" download><span class="icon">movie</span>Original</a>`);
    expect(pagina).toContain("Sem tratamento de áudio");
  });

  it("se o contêiner falhar, o vídeo continua com o original e o motivo aparece", async () => {
    const audio = new FakeAudioApi();
    audio.fail = "Tratamento do áudio falhou (HTTP 500): ffmpeg";
    const { api, studio } = await prontoParaTratar(audio);
    const video = (await studio.treatNextAudio())!;
    expect(video).toMatchObject({ audio_status: "failed", processed_key: null, audio_error: "Tratamento do áudio falhou (HTTP 500): ffmpeg" });
    const page = await (await call(new Request(`${SITE}/video/${video.id}`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).toContain(ERROS.audioFalhou);
    expect(page).not.toContain("Tratamento do áudio falhou");
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
    expect(await db.videoById(pendente!.id)).toMatchObject({ audio_status: "failed", audio_error: ERROS.audioDemorou });
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
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
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
    expect((req!.input_references![0] as { image_url: { url: string } }).image_url.url).toMatch(new RegExp(`^${SITE}/midia/avatares/[0-9a-f-]{36}\\.png$`));
    expect(req!.provider).toEqual({
      options: { heygen: { voice_id: VOICES[1]!.value, expressiveness: "medium", motion_prompt: `${MOTION_GUIDE} aponta para a câmera` } },
    });

    // O vídeo fica ligado à estrutura, com as configurações dela.
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "heygen", model: "heygen/avatar-iv", prompt: FALA, extra: "aponta para a câmera", style: null });
    expect(JSON.parse(video!.settings!)).toMatchObject({ voice_id: VOICES[1]!.value, expressiveness: "medium" });
    // Duração estimada pela fala (11 palavras a 2,4 por segundo).
    expect(video!.duration).toBe(5);

    // Fica na página do HeyGen, não na do Wan; os detalhes estão na página do vídeo.
    const page = await (await get("/modelo/heygen", undefined, api)).text();
    expect(page).toContain("≈ 5 s");
    expect(page).toContain(`href="/video/${video!.id}?de=%2Fmodelo%2Fheygen"`);
    const detalhes = await (await get(`/video/${video!.id}`, undefined, api)).text();
    expect(detalhes).toContain('<dt class="qe-result__label">Voz</dt><dd class="qe-result__value">Orus · masculina · multilíngue</dd>');
    expect(detalhes).toContain('<dt class="qe-result__label">Expressividade</dt><dd class="qe-result__value">Média</dd>');
    // O movimento é texto livre: tem bloco próprio, fora da lista.
    expect(detalhes).toContain('<h2 class="viewer__title">Movimento</h2><div class="viewer__card"><p class="viewer__text">aponta para a câmera</p>');
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

describe("Grok Imagine 1.5 Lite", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
  const MOVIMENTO = "sorri e olha para o produto na mesa";

  it("o custo é o da resolução em dólar por segundo, mais o da foto", () => {
    const values = (name: string) => ({ resolucao: "720p", duracao: "6" })[name] ?? "";
    expect(GROK.prices!(GROK_MODEL)).toEqual({ "480p": "0.02", "720p": "0.03", "1080p": "0.14", foto: "0.01" });
    expect(estimate(GROK, GROK_MODEL, values)).toBeCloseTo(0.19);
  });

  it("o formulário pede o movimento, a foto e o vídeo, sem fala nem voz", async () => {
    const page = await (await get("/modelo/grok")).text();
    expect(page).toContain('name="movimento"');
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).toMatch(/name="duracao"[^>]*>[\s\S]*<option value="15"/);
    expect(page).toContain('value="720p" checked');
    expect(page).not.toContain('name="fala"');
    expect(page).not.toContain('name="voz"');
    expect(page).toContain("descreva o movimento e toque em Gerar vídeo.");
    // O custo fixo da foto vai para a conta do navegador.
    expect(page).toContain("&quot;extra&quot;:0.01");
  });

  it("manda o movimento com o guia, a foto como primeiro quadro e sem áudio", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { movimento: `  ${MOVIMENTO}  `, imagem: foto(), duracao: "6", resolucao: "720p", formato: "9:16" }, "grok");
    expect(res.status).toBe(303);

    const [req] = api.submitted;
    expect(req).toMatchObject({ model: "x-ai/grok-imagine-video-1.5-lite", prompt: `${MOVIMENTO} ${GROK_GUIDE}`, duration: 6, resolution: "720p", aspect_ratio: "9:16", generate_audio: false });
    expect(req!.input_references).toBeUndefined();
    expect(req!.frame_images![0]).toMatchObject({ frame_type: "first_frame" });

    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "grok", prompt: "", extra: MOVIMENTO, duration: 6, request_prompt: req!.prompt });
    const detalhes = await (await get(`/video/${video!.id}`, undefined, api)).text();
    expect(detalhes).toContain(`<h2 class="viewer__title">Movimento</h2><div class="viewer__card"><p class="viewer__text">${MOVIMENTO}</p>`);
    // Refazer volta com o movimento e os ajustes.
    const refazer = await (await get(`/modelo/grok?refazer=${video!.id}`, undefined, api)).text();
    expect(refazer).toContain(MOVIMENTO);
  });

  it("recusa sem movimento, movimento longo, sem foto e duração fora do modelo", async () => {
    const api = new FakeVideoApi();
    const casos: [Record<string, string | File>, string][] = [
      [{ movimento: " ", imagem: foto() }, ERROS.movimento],
      [{ movimento: "a".repeat(1001), imagem: foto() }, ERROS.movimentoLongo(1000)],
      [{ movimento: MOVIMENTO }, ERROS.foto],
      [{ movimento: MOVIMENTO, imagem: foto(), duracao: "20" }, ERROS.ajustesNaoAceitos],
    ];
    for (const [fields, erro] of casos) {
      const res = await post(api, fields, "grok");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(api.submitted).toHaveLength(0);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("conta comum não vê nem usa o Grok", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/grok");
    expect((await get("/modelo/grok", member)).status).toBe(404);
    const res = await call(postForm("/modelo/grok", { movimento: MOVIMENTO, imagem: foto() }, { cookie: member }), api);
    expect(res.status).toBe(404);
    expect(api.submitted).toHaveLength(0);
  });
});

describe("mischief 1", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
  const MOVIMENTO = "a câmera se aproxima devagar do frasco na mesa";

  it("o custo é o da resolução em dólar por segundo, sem foto", () => {
    const values = (name: string) => ({ resolucao: "720p", duracao: "5" })[name] ?? "";
    expect(MISCHIEF.prices!(MISCHIEF_MODEL)).toEqual({ "480p": "0.005", "720p": "0.01" });
    expect(estimate(MISCHIEF, MISCHIEF_MODEL, values)).toBeCloseTo(0.05);
  });

  it("o formulário pede o movimento e a foto; 5 s, 720p e o único formato, 16:9", async () => {
    const page = await (await get("/modelo/mischief")).text();
    expect(page).toContain('name="movimento"');
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).toMatch(/<option value="5" selected/);
    expect(page).toContain('value="720p" checked');
    expect(page).toContain("O modelo só faz este formato.");
    expect(page).not.toContain('name="fala"');
  });

  it("manda o movimento com o guia, a foto como primeiro quadro e sem áudio", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { movimento: MOVIMENTO, imagem: foto(), duracao: "3", resolucao: "480p", formato: "16:9" }, "mischief");
    expect(res.status).toBe(303);
    const [req] = api.submitted;
    expect(req).toMatchObject({ model: "tbc/mischief-1", prompt: `${MOVIMENTO} ${MISCHIEF_GUIDE}`, duration: 3, resolution: "480p", aspect_ratio: "16:9", generate_audio: false });
    expect(req!.frame_images![0]).toMatchObject({ frame_type: "first_frame" });
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "mischief", prompt: "", extra: MOVIMENTO, duration: 3 });
  });

  it("recusa sem foto, vertical e duração fora do modelo", async () => {
    const api = new FakeVideoApi();
    const casos: [Record<string, string | File>, string][] = [
      [{ movimento: MOVIMENTO }, ERROS.foto],
      [{ movimento: MOVIMENTO, imagem: foto(), formato: "9:16" }, ERROS.ajustesNaoAceitos],
      [{ movimento: MOVIMENTO, imagem: foto(), duracao: "4" }, ERROS.ajustesNaoAceitos],
    ];
    for (const [fields, erro] of casos) {
      const res = await post(api, fields, "mischief");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(api.submitted).toHaveLength(0);
  });

  it("conta comum não vê nem usa o mischief", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/mischief");
    expect((await get("/modelo/mischief", member)).status).toBe(404);
    const res = await call(postForm("/modelo/mischief", { movimento: MOVIMENTO, imagem: foto() }, { cookie: member }), api);
    expect(res.status).toBe(404);
    expect(api.submitted).toHaveLength(0);
  });
});

describe("Gemini Omni 1.2 Flash", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
  const CENA = "apresentadora animada num estúdio, sorri no final";
  const PEDIDO_OMNI = { idioma: "pt-BR", fala: FALA, instrucoes: CENA, duracao: "8", resolucao: "720p", formato: "9:16" };

  it("o custo é o preço com áudio da resolução por segundo (1080p é o SKU sem sufixo, 4K em minúsculas)", () => {
    expect(OMNI.prices!(OMNI_MODEL)).toEqual({ "360p": "0.023172", "720p": "0.069504", "1080p": "0.104256", "4K": "0.208512" });
    const valores = (resolucao: string, duracao: string) => (name: string) => ({ resolucao, duracao })[name] ?? "";
    expect(estimate(OMNI, OMNI_MODEL, valores("720p", "8"))).toBeCloseTo(0.556032);
    expect(estimate(OMNI, OMNI_MODEL, valores("1080p", "15"))).toBeCloseTo(1.56384);
    expect(estimate(OMNI, OMNI_MODEL, valores("4K", "15"))).toBeCloseTo(3.12768);
  });

  it("o formulário tem o idioma com 'Sem fala: cena sem pessoa', o texto (com fala) ou as instruções (sem fala), a foto opcional e o vídeo", async () => {
    const page = await (await get("/modelo/omni")).text();
    expect(page).not.toContain('name="estilo"');
    expect(page).toContain(`<option value="${NO_SPEECH}" data-divider>Sem fala: cena sem pessoa</option>`);
    // O texto só aparece com um idioma; as instruções, só sem fala (e não voltam por avatar).
    const bloco = (campo: string) => new RegExp(`data-show-if="([^"]*)"[^>]*>\\s*<div class="text-field">\\s*<textarea [^>]*name="${campo}"`).exec(page)?.[1] ?? "";
    expect(bloco("fala")).toContain("pt-BR");
    expect(bloco("fala")).not.toContain(NO_SPEECH);
    expect(bloco("instrucoes")).toContain(NO_SPEECH);
    expect(bloco("instrucoes")).not.toContain("pt-BR");
    expect(page).not.toMatch(/<textarea [^>]*data-per-avatar/);
    expect(page).toMatch(new RegExp(`<textarea [^>]*name="fala" rows="1" required maxlength="${MAX_OMNI_SPEECH}"`));
    // A foto não é obrigatória no navegador: a cena sem pessoa sai só do texto.
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).not.toMatch(/<input [^>]*type="file" name="imagem"[^>]* required/);
    expect(page).toContain('<option value="8" selected>8 s</option>');
    expect(page).toContain('<option value="15">15 s</option>');
    expect(page).not.toContain('<option value="16"');
    expect(page).toContain('value="720p" checked');
    expect(page).toContain('value="9:16" checked');
    expect(page).toContain("US$ 0.56");
    // Resoluções da menor para a maior (o modelo lista 720p, 1080p, 4K, 360p).
    const ordem = [...page.matchAll(/name="resolucao" value="([^"]+)"/g)].map((m) => m[1]);
    expect(ordem).toEqual(["360p", "720p", "1080p", "4K"]);
  });

  it("com fala, manda o pedido da selfie (o que o 1.2 aceita com pessoa), sem instruções, e a foto como primeiro quadro", async () => {
    const api = new FakeVideoApi();
    // As instruções escondidas não vão no formulário.
    const res = await post(api, { ...PEDIDO_OMNI, instrucoes: "", imagem: foto() }, "omni");
    expect(res.status).toBe(303);

    const [req] = api.submitted;
    expect(req).toMatchObject({ model: "google/gemini-omni-1.2-flash", duration: 8, resolution: "720p", aspect_ratio: "9:16", generate_audio: true });
    expect(req!.prompt).toBe(omniTalkPrompt(FALA, LANGUAGES[0]!));
    expect(req!.prompt).toBe(`${STYLES.find((s) => s.id === "selfie")!.direction}\n${SPEECH_LEAD} "${FALA}"\n\n${qualityGuide(LANGUAGES[0]!)}`);
    expect(req!.prompt).not.toContain(OMNI_SINGLE_SHOT);
    expect(req!.frame_images![0]).toMatchObject({ frame_type: "first_frame" });
    expect(req!.input_references).toBeUndefined();

    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "omni", prompt: FALA, style: null, language: "pt-BR", extra: null, duration: 8, request_prompt: req!.prompt });
    const detalhes = await (await get(`/video/${video!.id}`, undefined, api)).text();
    expect(detalhes).not.toContain('<h2 class="viewer__title">Instruções</h2>');
    expect(await (await get(`/modelo/omni?refazer=${video!.id}`, undefined, api)).text()).toContain(FALA);
  });

  it("sem fala, a cena sem pessoa sai das instruções, com ou sem foto", async () => {
    const api = new FakeVideoApi();
    // O texto escondido não vai no formulário; se vier, é ignorado. Sem foto: só o texto.
    const res = await post(api, { ...PEDIDO_OMNI, idioma: NO_SPEECH, fala: FALA, instrucoes: `  ${CENA} ` }, "omni");
    expect(res.status).toBe(303);
    const [req] = api.submitted;
    expect(req!.prompt).toBe(`${CENA}\n${OMNI_SINGLE_SHOT}\n${OMNI_SILENT}\n\n${OMNI_SILENT_GUIDE}`);
    expect(req!.frame_images).toBeUndefined();
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ prompt: "", language: NO_SPEECH, extra: CENA, image_key: null });
    const detalhes = await (await get(`/video/${video!.id}`, undefined, api)).text();
    expect(detalhes).toContain("Sem fala");
    expect(detalhes).toContain(`<h2 class="viewer__title">Instruções</h2><div class="viewer__card"><p class="viewer__text">${CENA}</p>`);
    const refazer = await (await get(`/modelo/omni?refazer=${video!.id}`, undefined, api)).text();
    expect(refazer).toContain(`<option value="${NO_SPEECH}" selected data-divider>`);
    expect(refazer).toContain(CENA);

    // Com a foto (do produto), ela é o primeiro quadro.
    expect((await post(api, { ...PEDIDO_OMNI, idioma: NO_SPEECH, imagem: foto() }, "omni")).status).toBe(303);
    expect(api.submitted[1]!.frame_images![0]).toMatchObject({ frame_type: "first_frame" });
  });

  it("na 1.1, as instruções seguem com a pessoa e voltam com as últimas usadas com o avatar", async () => {
    const api = new FakeVideoApi();
    await post(api, { ...PEDIDO_OMNI, imagem: foto() }, "omni-11");
    expect(api.submitted[0]!.prompt).toBe(`${CENA}\n${OMNI_SINGLE_SHOT}\n${SPEECH_LEAD} "${FALA}"\n\n${qualityGuide(LANGUAGES[0]!)}`);
    // Sem foto, a 1.1 recusa mesmo sem fala.
    const semFoto = await post(api, { ...PEDIDO_OMNI, idioma: NO_SPEECH }, "omni-11");
    expect(semFoto.status).toBe(400);
    expect(await semFoto.text()).toContain(ERROS.foto);
    const db = new Db(env.DB);
    const admin = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!;
    const avatar = await db.insertAvatar({ id: crypto.randomUUID(), user_id: admin.id, name: "Marina" });
    await env.DB.prepare("UPDATE videos SET avatar_id = ?").bind(avatar.id).run();
    const page = await (await get("/modelo/omni-11", undefined, api)).text();
    expect(page).toContain(`data-avatar-pick="${avatar.id}"`);
    expect(page).toContain(`data-avatar-text="${CENA}"`);
    expect(page).toContain(`<option value="${NO_SPEECH}" data-divider>Sem fala</option>`);
    // As do Wan não voltam: só o campo marcado com perAvatar.
    expect(await (await get("/modelo/wan", undefined, api)).text()).not.toContain("data-avatar-text");
  });

  it("recusa a fala sem texto ou sem foto, a cena com fala, a cena vazia, a fala longa e a duração fora do modelo", async () => {
    const api = new FakeVideoApi();
    const FALANDO = { ...PEDIDO_OMNI, instrucoes: "" };
    const casos: [Record<string, string | File>, string][] = [
      [{ ...FALANDO, fala: " ", imagem: foto() }, ERROS.fala],
      [FALANDO, ERROS.foto],
      [{ ...PEDIDO_OMNI, imagem: foto() }, ERROS.cenaComFala],
      [{ ...FALANDO, idioma: NO_SPEECH, instrucoes: " " }, ERROS.instrucoes],
      [{ ...FALANDO, imagem: foto(), fala: "a".repeat(MAX_OMNI_SPEECH + 1) }, ERROS.falaLonga(MAX_OMNI_SPEECH)],
      [{ ...FALANDO, imagem: foto(), duracao: "16" }, ERROS.ajustesNaoAceitos],
    ];
    for (const [fields, erro] of casos) {
      const res = await post(api, fields, "omni");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(api.submitted).toHaveLength(0);
  });

  it("o seletor Versão troca entre o 1.2 e o 1.1, cada um com as durações e o preço dele", async () => {
    const page = await (await get("/modelo/omni")).text();
    expect(page).toContain("data-version-switch");
    expect(page).toMatch(/name="versao" value="omni-11"[^>]*>[\s\S]{0,120}1\.1/);
    expect(page).toMatch(/name="versao" value="omni" form="versao-fora" checked/);
    expect(page).toContain('<option value="15">15 s</option>');

    const old = await (await get("/modelo/omni-11")).text();
    expect(old).toContain("<title>Gemini Omni 1.1 Flash");
    expect(old).toMatch(/name="versao" value="omni-11" form="versao-fora" checked/);
    expect(old).toContain('<option value="10">10 s</option>');
    expect(old).not.toContain('<option value="11"');
    expect(old).toContain("US$ 0.81");
    expect(estimate(OMNI_11, OMNI_11_MODEL, (n) => ({ resolucao: "720p", duracao: "8" })[n] ?? "")).toBeCloseTo(0.81088);
  });

  it("o 1.1 manda o modelo dele, e as duas versões dividem o card e a lista", async () => {
    const api = new FakeVideoApi();
    expect((await post(api, { ...PEDIDO_OMNI, imagem: foto() }, "omni-11")).status).toBe(303);
    expect(api.submitted[0]).toMatchObject({ model: "google/gemini-omni-1.1-flash", duration: 8 });
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "omni-11", model: "google/gemini-omni-1.1-flash" });
    // A lista do 1.2 mostra o vídeo do 1.1; a tela inicial tem um card só, com a contagem dos dois.
    expect(await (await get("/modelo/omni", undefined, api)).text()).toContain(video!.id);
    const home = await (await get("/", undefined, api)).text();
    expect(home).toContain('href="/modelo/omni"');
    expect(home).not.toContain('href="/modelo/omni-11"');
    expect(await (await get("/videos?modelo=omni", undefined, api)).text()).toContain(video!.id);
  });

  it("conta comum não vê nem usa o Omni", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/omni");
    expect((await get("/modelo/omni", member)).status).toBe(404);
    expect((await get("/modelo/omni-11", member)).status).toBe(404);
    const res = await call(postForm("/modelo/omni", { ...PEDIDO_OMNI, imagem: foto() }, { cookie: member }), api);
    expect(res.status).toBe(404);
    expect(api.submitted).toHaveLength(0);
  });
});

describe("Nano Banana 2.1 (imagem)", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
  const CENA = "mulher na cozinha segurando um sérum roxo";

  it("o custo é o preço do token vezes os tokens da resolução; só 1K e 2K", () => {
    expect(NANO_BANANA.prices!(BANANA_MODEL)).toEqual({ "1K": String(0.00003 * 1300), "2K": String(0.00003 * 2000) });
    expect(estimate(NANO_BANANA, BANANA_MODEL, (n) => ({ resolucao: "1K" })[n] ?? "")).toBeCloseTo(0.039);
    expect(estimate(NANO_BANANA, BANANA_MODEL, (n) => ({ resolucao: "2K" })[n] ?? "")).toBeCloseTo(0.06);
  });

  it("o formulário pede a descrição e a foto opcional, sem duração; o botão gera imagem", async () => {
    const page = await (await get("/modelo/nano-banana")).text();
    expect(page).toContain('name="descricao"');
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).toContain('value="1K" checked');
    expect(page).not.toContain('value="4K"');
    expect(page).not.toContain('"estimate-list__value" data-seconds');
    expect(page).toContain("Gerar imagem");
    expect(page).toContain("As imagens geradas aparecem aqui.");
  });

  it("sem foto, gera só do texto na hora e guarda a imagem", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { descricao: `  ${CENA}  `, resolucao: "1K", formato: "9:16" }, "nano-banana");
    expect(res.status).toBe(303);
    expect(api.submitted).toHaveLength(0);
    const [req] = api.images;
    expect(req).toEqual({ model: "google/gemini-nano-banana-2.1", prompt: `${CENA} ${IMAGE_GUIDE}`, resolution: "1K", aspect_ratio: "9:16", input_references: undefined });

    const [image] = await new Db(env.DB).recentVideos();
    expect(image).toMatchObject({ structure: "nano-banana", status: "completed", prompt: CENA, duration: 0, cost: 0.039, video_key: `imagens/${image!.id}.png` });
    const file = await get(`/videos/${image!.id}.png`, undefined, api);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(await file.text()).toBe("png-falso");

    // A página é a do vídeo, com a imagem no lugar do player e o Baixar da imagem.
    const pagina = await (await get(`/video/${image!.id}`, undefined, api)).text();
    expect(pagina).toContain(`<img class="viewer__video" src="/videos/${image!.id}.png"`);
    expect(pagina).not.toContain('class="vbar"');
    expect(pagina).toContain(`href="/videos/${image!.id}.png?baixar" download`);
    expect(pagina).toContain('<h2 class="viewer__title">Descrição</h2>');
    expect(pagina).not.toContain('qe-result__label">Duração');
    // Na lista do modelo, o card mostra a imagem; a aba Vídeos não a mostra.
    const modelo = await (await get("/modelo/nano-banana", undefined, api)).text();
    expect(modelo).toContain(`src="/videos/${image!.id}.png"`);
    expect(await (await get("/videos", undefined, api)).text()).not.toContain(image!.id);
    // Refazer volta com a descrição.
    expect(await (await get(`/modelo/nano-banana?refazer=${image!.id}`, undefined, api)).text()).toContain(CENA);
  });

  it("com foto, ela vai como referência e o prompt pede para seguir", async () => {
    const api = new FakeVideoApi();
    await post(api, { descricao: CENA, imagem: foto(), resolucao: "2K", formato: "9:16" }, "nano-banana");
    const [req] = api.images;
    expect(req!.prompt).toBe(`${CENA} ${IMAGE_GUIDE} ${IMAGE_REFERENCE_GUIDE}`);
    expect(req!.input_references).toHaveLength(1);
    expect(req!.input_references![0]).toMatchObject({ type: "image_url" });
    const [image] = await new Db(env.DB).recentVideos();
    expect(image!.image_key).toMatch(/^avatares\//);
  });

  it("falha da API vira imagem com falha, com a frase do catálogo", async () => {
    const api = new FakeVideoApi();
    api.failImage = "OpenRouter respondeu HTTP 500";
    await post(api, { descricao: CENA, resolucao: "1K", formato: "9:16" }, "nano-banana");
    const [image] = await new Db(env.DB).recentVideos();
    expect(image).toMatchObject({ status: "failed", error: "OpenRouter respondeu HTTP 500", video_key: null });
    const pagina = await (await get(`/video/${image!.id}`, undefined, api)).text();
    expect(pagina).toContain(ERROS.imagemFalhou);
    expect(pagina).not.toContain("HTTP 500");
  });

  it("com o Durable Object, o pedido só registra; a imagem sai fora dele, uma vez só", async () => {
    const api = new FakeVideoApi();
    const started: string[] = [];
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, images: { start: async (id) => void started.push(id) } });
    await cookie();
    const user = { ...(await env.DB.prepare("SELECT id, email, name, role, created_at AS createdAt FROM users WHERE role = 'admin'").first<User>())!, permissoes: [] };
    const values = (n: string) => ({ descricao: CENA, resolucao: "1K", formato: "9:16" })[n] ?? "";
    const video = await studio.create({ structure: NANO_BANANA, values, image: foto(), user });
    // Sair da página agora não deixa nada preso: o pedido já voltou.
    expect(video).toMatchObject({ status: "in_progress", video_key: null });
    expect(started).toEqual([video.id]);
    expect(api.images).toHaveLength(0);

    const done = await studio.finishOutput(video.id);
    expect(done).toMatchObject({ status: "completed", cost: 0.039, video_key: `imagens/${video.id}.png` });
    expect(api.images[0]).toMatchObject({ prompt: `${CENA} ${IMAGE_GUIDE} ${IMAGE_REFERENCE_GUIDE}`, resolution: "1K", aspect_ratio: "9:16" });
    expect(api.images[0]!.input_references![0]).toMatchObject({ type: "image_url", image_url: { url: `${SITE}/midia/${video.image_key}` } });
    // O alarme repetido não paga a imagem de novo.
    await studio.finishOutput(video.id);
    expect(api.images).toHaveLength(1);
    // Quem espera (o gerar_imagem do MCP) vê a imagem pronta.
    expect(await studio.waitImage(video, 1000, 10)).toMatchObject({ status: "completed" });
  });

  it("o Durable Object guarda o id e gera pelo alarme", async () => {
    const db = new Db(env.DB);
    const id = "00000000-0000-4000-8000-000000000002";
    await db.insertVideo({ id, prompt: CENA, model: NANO_BANANA.model, duration: 0, resolution: "1K", aspect_ratio: "9:16", image_key: null, user_id: await dono(), request_prompt: CENA, style: null, language: null, extra: null, structure: "nano-banana", settings: null, avatar_id: null });
    await db.updateVideo(id, { status: "in_progress" });
    const stub = env.IMAGENS!.get(env.IMAGENS!.idFromName(id));
    await stub.start(id);
    // O alarme dispara logo: a linha sai de "Gerando" sem pedido nenhum aberto.
    for (const end = Date.now() + 3000; (await db.videoById(id))!.status === "in_progress" && Date.now() < end; ) await new Promise((ok) => setTimeout(ok, 50));
    // Nos testes não há chave do OpenRouter: o alarme chegou à geração e a linha virou falha, sem ficar presa.
    expect(await db.videoById(id)).toMatchObject({ status: "failed" });
    expect(await runInDurableObject(stub, (_, state) => state.storage.get("video"))).toBeUndefined();
  });

  it("imagem presa em Gerando vira falha depois de 5 minutos", async () => {
    const db = new Db(env.DB);
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    await db.insertVideo({ id: "00000000-0000-4000-8000-000000000001", prompt: CENA, model: NANO_BANANA.model, duration: 0, resolution: "1K", aspect_ratio: "9:16", image_key: null, user_id: await dono(), request_prompt: CENA, style: null, language: null, extra: null, structure: "nano-banana", settings: null, avatar_id: null });
    await env.DB.prepare("UPDATE videos SET status = 'in_progress', created_at = ? WHERE id = ?").bind(old, "00000000-0000-4000-8000-000000000001").run();
    await createStudio(env, { api: new FakeVideoApi() }).syncOpen();
    expect(await db.videoById("00000000-0000-4000-8000-000000000001")).toMatchObject({ status: "failed", error: "A imagem ou a fala não voltou a tempo." });
  });

  it("recusa sem descrição e descrição longa, sem chamar a API", async () => {
    const api = new FakeVideoApi();
    for (const [fields, erro] of [
      [{ descricao: " " }, ERROS.descricao],
      [{ descricao: "a".repeat(2001) }, ERROS.descricaoLonga(2000)],
    ] as [Record<string, string>, string][]) {
      const res = await post(api, fields, "nano-banana");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(api.images).toHaveLength(0);
  });

  it("conta comum não vê nem usa o modelo de imagem", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/nano-banana");
    expect((await get("/modelo/nano-banana", member)).status).toBe(404);
    const res = await call(postForm("/modelo/nano-banana", { descricao: CENA }, { cookie: member }), api);
    expect(res.status).toBe(404);
    expect(api.images).toHaveLength(0);
  });
});

describe("Seedance 2.0, troca de avatar (desativada)", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
  const origem = (seconds = 8.4, type = "video/mp4") => new File([fakeMp4(seconds)], "cena.mp4", { type });
  // O código fica testado: aqui a troca volta a valer, como se fosse religada.
  beforeEach(() => void (SEEDANCE_STRUCTURE.off = false));
  afterEach(() => void (SEEDANCE_STRUCTURE.off = true));

  it("desativada: sem página, sem gerar e fora do seletor Versão do Seedance", async () => {
    SEEDANCE_STRUCTURE.off = true;
    expect((await get("/modelo/seedance")).status).toBe(404);
    const api = new FakeVideoApi();
    expect((await post(api, { video: origem(), imagem: foto() }, "seedance")).status).toBe(404);
    expect(api.submitted).toHaveLength(0);
    const page = await (await get("/modelo/seedance-livre")).text();
    expect(page).toContain(">Mini<");
    expect(page).not.toContain("Troca de avatar");
  });

  it("lê a duração do MP4, com o moov no começo ou no fim e mvhd de 32 ou 64 bits", () => {
    expect(mp4Duration(fakeMp4(8.4).buffer)).toBeCloseTo(8.4);
    expect(mp4Duration(fakeMp4(12, { moovFirst: true }).buffer)).toBeCloseTo(12);
    expect(mp4Duration(fakeMp4(3.25, { version: 1 }).buffer)).toBeCloseTo(3.25);
    expect(mp4Duration(new TextEncoder().encode("não é um mp4").buffer as ArrayBuffer)).toBeNull();
    expect(mp4Duration(new ArrayBuffer(0))).toBeNull();
  });

  it("a duração pedida é a aceita mais perto da do vídeo enviado", () => {
    expect(outputSeconds(8.4, SEEDANCE.supported_durations)).toBe(8);
    expect(outputSeconds(2.2, SEEDANCE.supported_durations)).toBe(4);
    expect(outputSeconds(15.4, SEEDANCE.supported_durations)).toBe(15);
  });

  it("o custo é por token, com o vídeo enviado contando junto", () => {
    const values = (name: string) => ({ resolucao: "720p", formato: "9:16" })[name] ?? "";
    const perSecond = Number(SEEDANCE_STRUCTURE.prices!(SEEDANCE)["720p_9:16"]);
    expect(perSecond).toBeCloseTo(((720 * 1280 * 24) / 1024) * 0.0000043 * 2);
    expect(Number(SEEDANCE_STRUCTURE.prices!(SEEDANCE)["1080p_16:9"])).toBeCloseTo(((1920 * 1080 * 24) / 1024) * 0.0000047 * 2);
    // Antes de escolher o vídeo, a duração não se sabe no servidor: sem estimativa.
    expect(estimate(SEEDANCE_STRUCTURE, SEEDANCE, values)).toBeUndefined();
  });

  it("o formulário abre com o uso (hoje, trocar avatar) e pede o vídeo de origem e a foto, sem fala", async () => {
    const page = await (await get("/modelo/seedance")).text();
    expect(page).toMatch(/<select class="text-field__input" id="uso" name="uso"[^>]*><option value="trocar-avatar" selected/);
    expect(page.indexOf('name="uso"')).toBeLessThan(page.indexOf('name="video"'));
    expect(page).toMatch(/<input [^>]*type="file" name="video" accept="video\/mp4,video\/quicktime"/);
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).toContain('name="roupa" value="video" checked');
    expect(page).toContain('name="instrucoes"');
    expect(page).not.toContain('name="fala"');
    expect(page).toContain("Gerar vídeo");
    expect(page).toContain("&quot;720p_9:16&quot;");
  });

  it("manda o vídeo e a foto como referências, com a duração do vídeo e o áudio do modelo", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { video: origem(), imagem: foto(), roupa: "foto", instrucoes: "mantém os óculos", resolucao: "720p", formato: "9:16" }, "seedance");
    expect(res.status).toBe(303);

    const [req] = api.submitted;
    expect(req).toMatchObject({ model: "bytedance/seedance-2.0", duration: 8, resolution: "720p", aspect_ratio: "9:16", generate_audio: true });
    expect(req!.prompt).toBe(swapPrompt("foto", "mantém os óculos"));
    expect(req!.prompt).toContain("video 1");
    expect(req!.frame_images).toBeUndefined();
    const [video, image] = req!.input_references! as [{ type: string; video_url: { url: string } }, { type: string; image_url: { url: string } }];
    expect(video.type).toBe("video_url");
    expect(video.video_url.url).toMatch(new RegExp(`^${SITE}/midia/origens/[0-9a-f-]{36}\\.mp4$`));
    expect(image.image_url.url).toMatch(new RegExp(`^${SITE}/midia/avatares/[0-9a-f-]{36}\\.png$`));

    // O vídeo de origem fica público para o provedor baixar, sem login.
    const baixado = await call(new Request(video.video_url.url));
    expect(baixado.status).toBe(200);
    expect(baixado.headers.get("content-type")).toBe("video/mp4");

    const [criado] = await new Db(env.DB).recentVideos();
    expect(criado).toMatchObject({ structure: "seedance", duration: 8, prompt: "mantém os óculos", extra: "mantém os óculos", request_prompt: req!.prompt });
    const settings = JSON.parse(criado!.settings!);
    expect(settings).toMatchObject({ use: "trocar-avatar", outfit: "foto", source_seconds: "8.4" });
    expect(`${SITE}/midia/${settings.source_key}`).toBe(video.video_url.url);

    const detalhes = await (await get(`/video/${criado!.id}`, undefined, api)).text();
    expect(detalhes).toContain('<dt class="qe-result__label">Uso</dt><dd class="qe-result__value">Trocar avatar</dd>');
    expect(detalhes).toContain('<dt class="qe-result__label">Vídeo de origem</dt><dd class="qe-result__value">8,4 s</dd>');
    expect(detalhes).toContain('<dt class="qe-result__label">Roupa</dt><dd class="qe-result__value">Da foto</dd>');
    expect(detalhes).toContain('<dt class="qe-result__label">Duração</dt><dd class="qe-result__value">8 s</dd>');
  });

  it("sem instruções, o texto do vídeo fica vazio e sem o botão de copiar", async () => {
    const api = new FakeVideoApi();
    await post(api, { video: origem(5), imagem: foto() }, "seedance");
    const [criado] = await new Db(env.DB).recentVideos();
    expect(criado).toMatchObject({ prompt: "", extra: null, duration: 5 });
    expect(api.submitted[0]!.prompt).toBe(swapPrompt("video", ""));
    const detalhes = await (await get(`/video/${criado!.id}`, undefined, api)).text();
    expect(detalhes).not.toContain(`type="button" data-copy=`);
  });

  it("recusa uso fora da lista, sem vídeo, vídeo curto, longo, de outro tipo ou que não abre, sem foto e roupa inventada", async () => {
    const api = new FakeVideoApi();
    const casos: [Record<string, string | File>, string][] = [
      [{ uso: "inventado", video: origem(), imagem: foto() }, ERROS.uso],
      [{ imagem: foto() }, ERROS.videoOrigem],
      [{ video: origem(1.2), imagem: foto() }, ERROS.videoDuracao(2, 15)],
      [{ video: origem(20), imagem: foto() }, ERROS.videoDuracao(2, 15)],
      [{ video: origem(8, "video/webm"), imagem: foto() }, ERROS.videoTipo],
      [{ video: new File(["não é um mp4"], "cena.mp4", { type: "video/mp4" }), imagem: foto() }, ERROS.videoLeitura],
      [{ video: origem() }, ERROS.foto],
      [{ video: origem(), imagem: foto(), roupa: "fantasia" }, ERROS.roupa],
    ];
    for (const [fields, erro] of casos) {
      const res = await post(api, fields, "seedance");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(api.submitted).toHaveLength(0);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("conta comum não vê nem usa o Seedance", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/seedance");
    expect((await get("/modelo/seedance", member)).status).toBe(404);
    const res = await call(postForm("/modelo/seedance", { video: origem(), imagem: foto() }, { cookie: member }), api);
    expect(res.status).toBe(404);
    expect(api.submitted).toHaveLength(0);
  });
});

describe("Seedance livre", () => {
  it("é o card do Seedance, com o Mini no seletor Versão: a cena, o primeiro quadro e as opções do modelo; o preço sem vídeo é o do token cheio", async () => {
    expect(await (await get("/")).text()).toContain('href="/modelo/seedance-livre"');
    const page = await (await get("/modelo/seedance-livre")).text();
    expect(page).toContain('name="cena"');
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).not.toMatch(/type="file" name="video"/);
    // O seletor Versão: o principal pelo nome, primeiro, e o Mini.
    expect(page).toMatch(/data-version-switch[\s\S]*>Seedance 2\.0<[\s\S]*>Mini</);
    const precos = SEEDANCE_LIVRE.prices!(SEEDANCE);
    expect(Number(precos["720p_9:16"])).toBeCloseTo(((720 * 1280 * 24) / 1024) * 0.000007);
    expect(Number(precos["720p_9:16_video"])).toBeCloseTo(Number(SEEDANCE_STRUCTURE.prices!(SEEDANCE)["720p_9:16"]));
  });

  it("gera pelo site com a cena, sem o molde da troca de avatar", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { cena: "garrafa girando na mesa", duracao: "5", resolucao: "480p", formato: "1:1", som: "nao" }, "seedance-livre");
    expect(res.status).toBe(303);
    expect(api.submitted[0]).toMatchObject({ model: "bytedance/seedance-2.0", prompt: "garrafa girando na mesa", duration: 5, resolution: "480p", aspect_ratio: "1:1", generate_audio: false });
    expect(api.submitted[0]!.input_references).toBeUndefined();
  });
});

describe("HeyGen Video 1", () => {
  it("o formulário é o da cena livre, sem a escolha do som, e começa na resolução mais barata", async () => {
    const page = await (await get("/modelo/heygen-video")).text();
    expect(page).toContain('name="cena"');
    expect(page).not.toContain('name="som"');
    expect(page).toContain('name="resolucao" value="480p" checked');
    expect(page).toMatch(/<option value="8" selected/);
    expect(page).toContain("Descreva a cena, escolha os ajustes e toque em Gerar vídeo.");
    expect(page).toContain("&quot;480p_20&quot;:&quot;0.045&quot;");
  });

  it("conta comum não vê nem usa", async () => {
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/heygen-video");
    expect((await get("/modelo/heygen-video", member)).status).toBe(404);
  });
});

describe("FLUX Video Edit", () => {
  const origem = (seconds = 6.2) => new File([fakeMp4(seconds, { width: 1920, height: 1080 })], "cena.mp4", { type: "video/mp4" });

  it("o custo é US$ 0,03 por segundo do original; sem o vídeo, sem estimativa", () => {
    const values = () => "";
    expect(FLUX_EDIT.prices!(FLUX_EDIT_MODEL)).toEqual({ segundo: "0.03" });
    expect(estimate(FLUX_EDIT, FLUX_EDIT_MODEL, values, { seconds: 6.2 })).toBeCloseTo(0.186);
    expect(estimate(FLUX_EDIT, FLUX_EDIT_MODEL, values)).toBeUndefined();
  });

  it("o formulário pede o vídeo de origem e o que mudar, sem foto nem fala", async () => {
    const page = await (await get("/modelo/flux-edit")).text();
    expect(page).toMatch(/<input [^>]*type="file" name="video" accept="video\/mp4,video\/quicktime"/);
    expect(page).toContain('name="cena"');
    expect(page).not.toMatch(/type="file" name="imagem"/);
    expect(page).not.toContain('name="fala"');
    expect(page).toContain("Escolha o vídeo, descreva o que mudar e toque em Gerar vídeo.");
  });

  it("manda só o texto e o vídeo; o vídeo fica com a duração e o quadro do original", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { video: origem(), cena: "  tira o   copo da mesa " }, "flux-edit");
    expect(res.status).toBe(303);
    const [req] = api.submitted;
    expect(req).toEqual({ model: "black-forest-labs/flux-video-edit", prompt: "tira o copo da mesa", input_references: [{ type: "video_url", video_url: { url: expect.stringMatching(new RegExp(`^${SITE}/midia/origens/[0-9a-f-]{36}\\.mp4$`)) } }], callback_url: expect.any(String) });
    const [criado] = await new Db(env.DB).recentVideos();
    expect(criado).toMatchObject({ structure: "flux-edit", prompt: "tira o copo da mesa", duration: 6, resolution: "1080p", aspect_ratio: "16:9" });
    const detalhes = await (await get(`/video/${criado!.id}`, undefined, api)).text();
    expect(detalhes).toContain('<dt class="qe-result__label">Vídeo de origem</dt><dd class="qe-result__value">6,2 s</dd>');
  });

  it("recusa sem vídeo, sem edição, edição longa e vídeo fora da duração", async () => {
    const api = new FakeVideoApi();
    const casos: [Record<string, string | File>, string][] = [
      [{ cena: "tira o copo" }, ERROS.videoOrigem],
      [{ video: origem() }, ERROS.edicao],
      [{ video: origem(), cena: "x".repeat(1001) }, ERROS.edicaoLonga(1000)],
      [{ video: origem(1.2), cena: "tira o copo" }, ERROS.videoDuracao(2, 15)],
      [{ video: origem(20), cena: "tira o copo" }, ERROS.videoDuracao(2, 15)],
    ];
    for (const [fields, erro] of casos) {
      const res = await post(api, fields, "flux-edit");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(api.submitted).toHaveLength(0);
  });

  it("conta comum não vê nem usa o FLUX Video Edit", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/flux-edit");
    expect((await get("/modelo/flux-edit", member)).status).toBe(404);
    const res = await call(postForm("/modelo/flux-edit", { video: origem(), cena: "tira o copo" }, { cookie: member }), api);
    expect(res.status).toBe(404);
    expect(api.submitted).toHaveLength(0);
  });
});

describe("Aleph 2 desativado", () => {
  const origem = () => new File([fakeMp4(5.5, { width: 1280, height: 720 })], "cena.mp4", { type: "video/mp4" });

  it("sem card, sem página e sem gerar; o vídeo que já fez abre, sem o Refazer", async () => {
    expect(ALEPH.off).toBe(true);
    const api = new FakeVideoApi();
    expect(await (await get("/")).text()).not.toContain("/modelo/aleph");
    expect((await get("/modelo/aleph")).status).toBe(404);
    const res = await post(api, { video: origem(), imagem: new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" }) }, "aleph");
    expect(res.status).toBe(404);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);

    const db = new Db(env.DB);
    // Um vídeo do próprio administrador (sem dono diferente, o Refazer apareceria com o Aleph ligado).
    await cookie();
    const admin = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first<{ id: number }>())!.id;
    const antigo = await db.insertVideo({ id: crypto.randomUUID(), user_id: admin, structure: "aleph", model: "runway/aleph-2", prompt: "", duration: 6, resolution: "1080p", aspect_ratio: "9:16", request_prompt: alephPrompt(""), style: null, language: null, extra: null, image_key: null, avatar_id: null, settings: null });
    await db.updateVideo(antigo.id, { status: "completed", video_key: `videos/${antigo.id}.mp4` });
    const pagina = await get(`/video/${antigo.id}`, undefined, api);
    expect(pagina.status).toBe(200);
    expect(await pagina.text()).not.toContain("?refazer=");
    ALEPH.off = false;
    expect(await (await get(`/video/${antigo.id}`, undefined, api)).text()).toContain("?refazer=");
    ALEPH.off = true;
  });
});

describe("Aleph 2", () => {
  const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
  const origem = (seconds = 5.5) => new File([fakeMp4(seconds, { width: 1280, height: 720 })], "cena.mp4", { type: "video/mp4" });
  // O código fica testado: aqui o Aleph volta a valer, como se fosse religado.
  beforeEach(() => void (ALEPH.off = false));
  afterEach(() => void (ALEPH.off = true));
  const studio = (api: FakeVideoApi, audio: FakeAudioApi) => createStudio({ ...env, SITE_URL: SITE }, { api, audio });
  async function pedido(api: FakeVideoApi, audio: FakeAudioApi | null, fields: Record<string, string | File> = {}) {
    return post(api, { video: origem(), imagem: foto(), ...fields }, "aleph", audio);
  }

  it("quadros-chave espalhados até a duração em segundos inteiros, formato pelo nome comum e a resposta da conferência", () => {
    expect(keyframeTimes(5.5)).toEqual([0, 1.25, 2.5, 3.75, 5]);
    expect(keyframeTimes(2.2)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(aspectLabel(1078, 1920)).toBe("9:16");
    expect(aspectLabel(1920, 1080)).toBe("16:9");
    expect(aspectLabel(1000, 1100)).toBe("1000:1100");
    expect(parseCheck('```json\n{"fundo": true, "objetos": false, "maos": true, "detalhes": "prateleira nova"}\n```')).toEqual({ fundo: true, objetos: false, maos: true, detalhes: "prateleira nova" });
    expect(parseCheck("não sei")).toBeNull();
    expect(parseCheck('{"objetos": true}')).toBeNull();
  });

  it("lê o tamanho do quadro do MP4", async () => {
    const { mp4Size } = await import("../src/mp4");
    expect(mp4Size(fakeMp4(3, { width: 1078, height: 1920 }).buffer)).toEqual({ width: 1078, height: 1920 });
    expect(mp4Size(fakeMp4(3).buffer)).toBeNull();
  });

  it("o custo é por segundo (o preço vem em centavos) mais as imagens dos quadros-chave", async () => {
    expect(ALEPH.prices!(ALEPH_MODEL)).toEqual({ segundo: "0.28" });
    expect(ALEPH.cost.extra).toBeCloseTo(0.2);
    const page = await (await get("/modelo/aleph")).text();
    expect(page).toContain("&quot;extra&quot;:0.2");
    // O que o Aleph cobrou nos testes: 5 s (US$ 1,40) de 5,5 a 20,4 s; abaixo disso, por segundo.
    expect(page).toContain("&quot;billed&quot;:{&quot;max&quot;:5}");
    expect([3, 5, 6, 20].map((s) => billedSeconds(ALEPH.cost, s) * 0.28 + ALEPH.cost.extra!)).toEqual([0.84 + 0.2, 1.4 + 0.2, 1.4 + 0.2, 1.4 + 0.2].map((n) => expect.closeTo(n)));
  });

  it("o formulário abre com o uso e pede o vídeo e a foto, sem resolução nem formato", async () => {
    const page = await (await get("/modelo/aleph")).text();
    expect(page).toMatch(/<select class="text-field__input" id="uso" name="uso"[^>]*><option value="trocar-avatar" selected/);
    expect(page).toMatch(/<input [^>]*type="file" name="video"/);
    expect(page).toMatch(/<input [^>]*type="file" name="imagem"/);
    expect(page).not.toContain('name="resolucao"');
    expect(page).not.toContain('name="formato"');
  });

  it("sem contêiner, a troca é recusada antes de guardar qualquer coisa", async () => {
    const api = new FakeVideoApi();
    const res = await pedido(api, null);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(ERROS.trocaIndisponivel);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("ao gerar, guarda o vídeo e a foto e entra na fila de preparo, sem pedir nada ao OpenRouter", async () => {
    const api = new FakeVideoApi();
    const res = await pedido(api, new FakeAudioApi(), { instrucoes: "mantém os óculos" });
    expect(res.status).toBe(303);
    expect(api.submitted).toHaveLength(0);
    expect(api.chats).toHaveLength(0);
    const [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ structure: "aleph", status: "submitting", prep_status: "pending", job_id: null, extra: "mantém os óculos", request_prompt: alephPrompt("mantém os óculos") });
    const settings = JSON.parse(video!.settings!);
    expect(settings).toMatchObject({ use: "trocar-avatar", source_seconds: "5.5" });
    expect(await env.MIDIA.head(settings.source_key)).not.toBeNull();
    expect(await env.MIDIA.head(video!.image_key!)).not.toBeNull();
    expect(await (await get("/modelo/aleph", undefined, api)).text()).toContain("Preparando · 0 min");
  });

  it("o preparo amplia o vídeo, troca o rosto nos 5 quadros, confere o fundo e pede ao Aleph com os quadros-chave", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    const pronto = await studio(api, audio).prepareNext();
    expect(pronto).toMatchObject({ status: "pending", prep_status: "done", job_id: "job-1", aspect_ratio: "9:16", resolution: "1078p", duration: 6 });
    expect(audio.prepared).toBe(1);
    expect(audio.frameTimes).toEqual([[0, 1.25, 2.5, 3.75, 5]]);

    // Em cadeia: o primeiro quadro sai da foto (quadro, foto e recorte do rosto); os outros, da referência
    // (quadro, primeiro quadro já trocado e recorte). Cada um confere o fundo; os da cadeia, também o cabelo.
    const faces = api.chats.filter((c) => c.model === FACE_MODEL);
    const checks = api.chats.filter((c) => c.model === CHECK_MODEL);
    expect(faces).toHaveLength(5);
    expect(checks).toHaveLength(9);
    const imagens = (c: (typeof faces)[number]) => c.messages[0]!.content.flatMap((p) => (p.type === "image_url" ? [atob(p.image_url.url.split(",")[1]!)] : []));
    expect(imagens(faces[0]!)).toEqual(["quadro-0", "\u0001\u0002\u0003", "rosto"]);
    expect(imagens(faces[1]!)).toEqual(["quadro-1.25", "quadro-0+rosto-1078x1920", "rosto"]);
    expect(checks.filter((c) => c.messages[0]!.content.some((p) => p.type === "text" && p.text.includes("cabelo_igual")))).toHaveLength(4);

    const [req] = api.submitted;
    expect(req).toMatchObject({ model: "runway/aleph-2", prompt: alephPrompt("") });
    expect(req!.aspect_ratio).toBeUndefined();
    expect(req!.duration).toBeUndefined();
    expect(req!.callback_url).toBe(`${SITE}/openrouter/webhook`);
    const [source] = req!.input_references! as { type: string; video_url: { url: string } }[];
    expect(source!.type).toBe("video_url");
    expect(source!.video_url.url).toBe(`${SITE}/midia/origens/${pronto!.id}.preparado.mp4`);
    const keyframes = (req!.provider!.options.runway as { keyframes: { seconds: number; uri: string }[] }).keyframes;
    expect(keyframes.map((k) => k.seconds)).toEqual([0, 1.25, 2.5, 3.75, 5]);
    expect(keyframes[0]!.uri).toBe(`${SITE}/midia/quadros/${pronto!.id}/0.jpg`);

    // Os quadros-chave ficam públicos para o provedor baixar, já no tamanho do vídeo.
    const quadro = await call(new Request(keyframes[2]!.uri));
    expect(quadro.status).toBe(200);
    expect(await quadro.text()).toBe("quadro-2.5+rosto-1078x1920");
    const preparado = await call(new Request(source!.video_url.url));
    expect(preparado.status).toBe(200);

    const settings = JSON.parse(pronto!.settings!);
    expect(settings).toMatchObject({ keyframes: "5", prep_cost: "0.2090", prepared_key: `origens/${pronto!.id}.preparado.mp4` });
    const detalhes = await (await get(`/video/${pronto!.id}`, undefined, api)).text();
    expect(detalhes).toContain('<dt class="qe-result__label">Quadros-chave</dt><dd class="qe-result__value">5 de 5</dd>');

    // Pronto no Aleph: a saída fica guardada e o vídeo vai para a composição ("Finalizando").
    api.finish("job-1", { status: "completed", usage: { cost: 1.4 } });
    await studio(api, audio).syncOpen();
    let [video] = await new Db(env.DB).recentVideos();
    expect(video).toMatchObject({ status: "in_progress", prep_status: "compose", video_key: null });
    expect(video!.cost).toBeCloseTo(1.609);
    expect(JSON.parse(video!.settings!).aleph_key).toBe(`videos/${video!.id}.aleph.mp4`);
    expect(await (await get(`/modelo/aleph`, undefined, api)).text()).toContain("Finalizando · 0 min");
    // Enquanto espera, o agendamento não consulta o job de novo.
    await studio(api, audio).syncOpen();
    expect(api.downloads).toBe(1);

    // A composição recebe o preparado e a saída do Aleph emendados; o vídeo fica pronto com o composto.
    await studio(api, audio).prepareNext();
    [video] = await new Db(env.DB).recentVideos();
    expect(audio.composed).toBe(1);
    expect(video).toMatchObject({ status: "completed", prep_status: "done", video_key: `videos/${video!.id}.mp4`, audio_status: null });
    expect(await (await env.MIDIA.get(video!.video_key!))!.text()).toBe(`composto(${audio.preparedMp4.length}, mp4-falso)`);
    expect(video!.cost).toBeCloseTo(1.609);
  });

  it("se a composição falhar ou demorar, o vídeo fica pronto com a saída pura do Aleph", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    await studio(api, audio).prepareNext();
    api.finish("job-1", { status: "completed", usage: { cost: 1.4 } });
    await studio(api, audio).syncOpen();
    audio.failCompose = "ffmpeg quebrou";
    const pronto = await studio(api, audio).prepareNext();
    expect(pronto).toMatchObject({ status: "completed", prep_status: "failed", video_key: `videos/${pronto!.id}.aleph.mp4` });
    expect(pronto!.prep_error).toContain("ffmpeg quebrou");

    // Composição que não termina em 20 minutos: o mesmo.
    const audio2 = new FakeAudioApi();
    await pedido(api, audio2);
    await studio(api, audio2).prepareNext();
    api.finish("job-2", { status: "completed", usage: { cost: 1.4 } });
    await studio(api, audio2).syncOpen();
    const db = new Db(env.DB);
    const inicio = new Date();
    const travado = await db.claimCompose(inicio.toISOString());
    await studio(api, audio2).prepareNext(new Date(inicio.getTime() + 21 * 60_000));
    expect(await db.videoById(travado!.id)).toMatchObject({ status: "completed", prep_status: "failed", video_key: `videos/${travado!.id}.aleph.mp4` });
  });

  it("primeiro quadro reprovado: a referência passa a ser o seguinte; cabelo diferente do da referência fica de fora", async () => {
    const api = new FakeVideoApi();
    api.rejectFrames = ["quadro-0"];
    api.rejectHair = ["quadro-3.75"];
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    await studio(api, audio).prepareNext();
    const keyframes = (api.submitted[0]!.provider!.options.runway as { keyframes: { seconds: number }[] }).keyframes;
    expect(keyframes.map((k) => k.seconds)).toEqual([1.25, 2.5, 5]);
    // Os da cadeia usam o quadro de 1,25 s trocado como referência.
    const faces = api.chats.filter((c) => c.model === FACE_MODEL);
    const ultimo = faces.at(-1)!.messages[0]!.content.flatMap((p) => (p.type === "image_url" ? [atob(p.image_url.url.split(",")[1]!)] : []));
    expect(ultimo[1]).toBe("quadro-1.25+rosto-1078x1920");
  });

  it("quadro reprovado no fundo é refeito uma vez e, reprovado de novo, fica de fora", async () => {
    const api = new FakeVideoApi();
    api.rejectFrames = ["quadro-2.5"];
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    const pronto = await studio(api, audio).prepareNext();
    expect(api.chats.filter((c) => c.model === FACE_MODEL)).toHaveLength(6);
    const keyframes = (api.submitted[0]!.provider!.options.runway as { keyframes: { seconds: number }[] }).keyframes;
    expect(keyframes.map((k) => k.seconds)).toEqual([0, 1.25, 3.75, 5]);
    expect(JSON.parse(pronto!.settings!).keyframes).toBe("4");
  });

  it("troca de rosto que volta sem imagem é tentada de novo", async () => {
    const api = new FakeVideoApi();
    api.facesWithoutImage = 1;
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    await studio(api, audio).prepareNext();
    expect(api.chats.filter((c) => c.model === FACE_MODEL)).toHaveLength(6);
    expect((api.submitted[0]!.provider!.options.runway as { keyframes: unknown[] }).keyframes).toHaveLength(5);
  });

  it("sem rosto na foto, a troca vai só com a foto inteira", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    audio.noFace = true;
    await pedido(api, audio);
    await studio(api, audio).prepareNext();
    expect(api.chats.find((c) => c.model === FACE_MODEL)!.messages[0]!.content.filter((p) => p.type === "image_url")).toHaveLength(2);
  });

  it("se nenhum quadro passar ou o contêiner falhar, o vídeo vira falha sem pedir ao Aleph", async () => {
    const api = new FakeVideoApi();
    api.rejectFrames = keyframeTimes(5.5).map((t) => `quadro-${t}`);
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    const falhou = await studio(api, audio).prepareNext();
    expect(falhou).toMatchObject({ status: "failed", prep_status: "failed" });
    expect(falhou!.error).toContain("Nenhum quadro-chave");
    expect(api.submitted).toHaveLength(0);
    // Na tela, a frase do catálogo; o motivo técnico fica no banco.
    const pagina = await (await get(`/video/${falhou!.id}`, undefined, api)).text();
    expect(pagina).toContain(ERROS.videoFalhou);
    expect(pagina).not.toContain("Nenhum quadro-chave");

    const api2 = new FakeVideoApi();
    const audio2 = new FakeAudioApi();
    audio2.fail = "ffmpeg quebrou";
    await pedido(api2, audio2);
    expect(await studio(api2, audio2).prepareNext()).toMatchObject({ status: "failed", prep_status: "failed", error: expect.stringContaining("ffmpeg quebrou") });
  });

  it("um preparo por rodada; sem fila, nada acontece", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    await pedido(api, audio);
    expect(await studio(api, audio).prepareNext()).not.toBeNull();
    expect(api.submitted).toHaveLength(1);
    expect(await studio(api, audio).prepareNext()).not.toBeNull();
    expect(await studio(api, audio).prepareNext()).toBeNull();
    expect(api.submitted).toHaveLength(2);
  });

  it("preparo que não termina em 20 minutos vira falha", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    await pedido(api, audio);
    const db = new Db(env.DB);
    const inicio = new Date();
    await db.claimPrep(inicio.toISOString());
    await studio(api, audio).prepareNext(new Date(inicio.getTime() + 21 * 60_000));
    const [video] = await db.recentVideos();
    expect(video).toMatchObject({ status: "failed", prep_status: "failed" });
    expect(api.submitted).toHaveLength(0);
  });

  it("recusa uso fora da lista, sem vídeo, vídeo longo e sem foto", async () => {
    const api = new FakeVideoApi();
    const audio = new FakeAudioApi();
    const casos: [Record<string, string | File>, string][] = [
      [{ uso: "inventado" }, ERROS.uso],
      [{ video: "" }, ERROS.videoOrigem],
      [{ video: origem(40) }, ERROS.videoDuracao(2, 30)],
      [{ imagem: "" }, ERROS.foto],
    ];
    for (const [fields, erro] of casos) {
      const res = await pedido(api, audio, fields);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(erro);
    }
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });

  it("conta comum não vê nem usa o Aleph", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect(await (await get("/", member)).text()).not.toContain("/modelo/aleph");
    expect((await get("/modelo/aleph", member)).status).toBe(404);
    const res = await call(postForm("/modelo/aleph", { video: origem(), imagem: foto() }, { cookie: member }), api, new FakeAudioApi());
    expect(res.status).toBe(404);
    expect(await new Db(env.DB).recentVideos()).toHaveLength(0);
  });
});

describe("edição rápida", () => {
  const BOTAO = 'data-tab="qe"';
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

  it("a aba Edição rápida abre a prévia no vídeo pronto do HeyGen; o agendamento edita com os trechos dela e o player mostra a editada", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    const session = await cookie();
    const ver = async (query = "") => (await call(new Request(`${SITE}/video/${video.id}${query}`, { headers: { cookie: session } }), api, audio)).text();
    let page = await ver();
    expect(page).toContain(`action="/videos/${video.id}/edicao-rapida"`);
    expect(page).toContain(BOTAO);
    expect(page).toContain("data-quick-edit=");
    expect(page).toMatch(/name="pausa" value="media" form="edicao-rapida"[^>]* checked/);
    expect(page).toMatch(/name="camera" value="close" form="edicao-rapida"[^>]* checked/);
    expect(page).toContain("Gerar editado");
    expect(page).toContain("data-qe-preview");
    // A ajuda da opção escolhida aparece embaixo de cada ajuste, curta.
    expect(page).toContain('data-help-for="pausa">Deixa um respiro curto.</p>');
    expect(page).toContain('data-help-for="camera">Alterna com zoom perto.</p>');

    const trechos = [[0.42, 7.417, 1], [7.928, 10.91, 1.25]];
    const res = await pedir(video.id, api, audio, session, { pausa: "longa", camera: "zoom", trechos: JSON.stringify(trechos) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/video/${video.id}`);
    page = await ver();
    expect(page).toContain("Editando o vídeo");
    expect(page).toContain("data-refresh=");
    expect(page).not.toContain(BOTAO);
    // Pedir de novo enquanto está na fila não duplica: a página do vídeo volta com o aviso.
    const repetido = await pedir(video.id, api, audio, session);
    expect(repetido.status).toBe(400);
    expect(await repetido.text()).toContain("data-snackbar");

    const editado = (await studio.editNext())!;
    expect(editado).toMatchObject({ edit_status: "done", edited_key: `videos/${video.id}.editado.mp4` });
    expect(await studio.editNext()).toBeNull();
    expect(audio!.edits).toBe(1);
    expect(audio!.plans).toEqual([{ pausa: 0.35, zooms: [1, 1.25], trechos }]);

    const mp4 = await call(new Request(`${SITE}/videos/${video.id}.editado.mp4?baixar`, { headers: { cookie: session } }), api, audio);
    expect(await mp4.text()).toBe("mp4-falso+editado");
    expect(mp4.headers.get("content-disposition")).toContain(" (editado).mp4");
    // A edição que vale fica guardada: quando e com que escolhas.
    expect(editado.edited_at).toBeTruthy();
    expect(JSON.parse(editado.edited_plan!)).toMatchObject({ pause: "longa", camera: "zoom" });
    page = await ver();
    // O player abre no editado, com o endereço da edição (muda a cada uma, por causa do cache).
    const editadoSrc = `/videos/${video.id}.editado.mp4?v=${encodeURIComponent(editado.edited_at!)}`;
    expect(page).toContain(`src="${editadoSrc}"`);
    expect(page).toContain("Este vídeo já foi editado");
    expect(page).toContain('<span class="qe-result__label">Pausas</span><span class="qe-result__value">Longas</span>');
    expect(page).toContain('<span class="qe-result__label">Câmera</span><span class="qe-result__value">Zoom</span>');
    expect(page).toContain("data-qe-again");
    expect(page).toContain("Substituir editado");
    // As escolhas da edição que vale vêm marcadas.
    expect(page).toMatch(/name="pausa" value="longa" form="edicao-rapida"[^>]* checked/);
    // Original | Editado só na aba Edição rápida (a Informações não repete).
    expect(page).not.toContain("Ver o original");
    page = await ver("?original");
    expect(page).toContain(`src="/videos/${video.id}.mp4"`);
    // Editado, dá para refazer com outras escolhas; sem os trechos da prévia, o contêiner acha os silêncios.
    expect(page).toContain(BOTAO);
    expect((await pedir(video.id, api, audio, session, { pausa: "curta", camera: "parada" })).status).toBe(303);
    const refeito = (await studio.editNext(new Date(Date.parse(editado.edited_at!) + 60_000)))!;
    expect(audio!.plans[1]).toEqual({ pausa: 0.1, zooms: [1] });
    expect(refeito.edited_at).not.toBe(editado.edited_at);
    expect(await ver()).toContain(`.editado.mp4?v=${encodeURIComponent(refeito.edited_at!)}`);
  });

  it("se a nova edição falhar, a página continua mostrando a edição que vale, com as escolhas dela", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    await pedir(video.id, api, audio, undefined, { pausa: "longa", camera: "zoom" });
    await studio.editNext();
    await pedir(video.id, api, audio, undefined, { pausa: "curta", camera: "parada" });
    audio!.fail = "Edição rápida falhou (HTTP 500): ffmpeg";
    await studio.editNext();
    const page = await (await call(new Request(`${SITE}/video/${video.id}`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).toContain('<span class="qe-result__label">Pausas</span><span class="qe-result__value">Longas</span>');
    expect(page).toContain(`src="/videos/${video.id}.editado.mp4?v=`);
  });

  it("o rosto só é procurado quando pedido: guardado, a miniatura das listas enquadra nele; sem rosto, grava vazio", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    // Sem procurar: o terço de cima do vídeo (9:16 num quadrado), sem ligar o contêiner.
    let lista = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(lista).toContain('style="object-position:50.0% 28.6%"');
    expect(audio!.faces).toBe(0);
    expect(await studio.faceOnDemand({ video })).toBe(JSON.stringify({ x: 0.46, y: 0.44, altura: 0.25 }));
    expect(audio!.faces).toBe(1);
    // Os olhos (y = 0,44 do quadro) a 40% da altura do quadrado.
    lista = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(lista).toContain('style="object-position:50.0% 49.1%"');
    audio!.fail = "Rosto (HTTP 500)";
    expect(await studio.faceOnDemand({ video })).toBe("{}");
  });

  it("o rosto achado no navegador fica guardado (só o primeiro), vai à prévia e ao plano da edição, sem o contêiner", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    const session = await cookie();
    const rosto = () => call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: session } }), api, audio);
    const guardar = (body: unknown) =>
      call(new Request(`${SITE}/videos/${video.id}/rosto`, { method: "POST", body: JSON.stringify(body), headers: { origin: SITE, cookie: session, "content-type": "application/json" } }), api, audio);
    // Ainda não procurado: null, para o navegador procurar.
    let res = await rosto();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    // A lista pede a procura na miniatura.
    let lista = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: session } }), api, audio)).text();
    expect(lista).toContain(`data-face-find="/videos/${video.id}/rosto"`);

    expect((await guardar({ x: 0.46, y: 0.44, altura: 0.25 })).status).toBe(204);
    expect((await guardar({ x: 0.1, y: 0.1, altura: 0.1 })).status).toBe(204);
    expect(await (await rosto()).json()).toEqual({ x: 0.46, y: 0.44, altura: 0.25 });
    lista = await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: session } }), api, audio)).text();
    expect(lista).not.toContain(`data-face-find="`);
    expect(lista).toContain('style="object-position:50.0% 49.1%"');
    // Fora do formato: recusa.
    for (const ruim of [{ x: 2, y: 0.4, altura: 0.2 }, { x: 0.4 }, [], { x: 0.4, y: 0.4, altura: 0.2, outro: 1 }]) expect((await guardar(ruim)).status).toBe(400);

    await pedir(video.id, api, audio, session, { pausa: "media", camera: "close" });
    await studio.editNext();
    expect(audio!.plans[0]).toEqual({ pausa: 0.2, zooms: [1, 1.25, 1, 1.5], rosto: { x: 0.46, y: 0.44 } });
    expect(audio!.faces).toBe(0);
  });

  it("sem rosto achado no navegador, guarda vazio e o plano vai sem rosto (o contêiner acha na edição)", async () => {
    const { api, audio, studio, video } = await pronto("heygen");
    const session = await cookie();
    const res = await call(new Request(`${SITE}/videos/${video.id}/rosto`, { method: "POST", body: "{}", headers: { origin: SITE, cookie: session } }), api, audio);
    expect(res.status).toBe(204);
    expect(await (await call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: session } }), api, audio)).json()).toEqual({});
    await pedir(video.id, api, audio);
    await studio.editNext();
    expect(audio!.plans[0]).not.toHaveProperty("rosto");
  });

  it("conta comum não pede o rosto de um vídeo do HeyGen, nem dela", async () => {
    const { api, audio, video } = await pronto("heygen");
    const member = await memberCookie();
    await env.DB.prepare("UPDATE videos SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(video.id).run();
    const res = await call(new Request(`${SITE}/videos/${video.id}/rosto`, { headers: { cookie: member } }), api, audio);
    expect(res.status).toBe(403);
    expect(audio!.faces).toBe(0);
    // Nem guarda: o modelo em teste não existe para ela.
    const post = await call(new Request(`${SITE}/videos/${video.id}/rosto`, { method: "POST", body: '{"x":0.5,"y":0.5,"altura":0.2}', headers: { origin: SITE, cookie: member } }), api, audio);
    expect(post.status).toBe(404);
    expect((await new Db(env.DB).videoById(video.id))!.face).toBeNull();
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
    const page = await (await call(new Request(`${SITE}/video/${video.id}`, { headers: { cookie: await cookie() } }), api, audio)).text();
    expect(page).toContain(ERROS.edicaoFalhou);
    expect(page).not.toContain("HTTP 500");
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
    expect(await db.videoById(video.id)).toMatchObject({ edit_status: "failed", edit_error: ERROS.edicaoDemorou });
  });

  it("o Wan não tem edição rápida: sem botão e recusada mesmo mandando direto", async () => {
    const { api, audio, studio, video } = await pronto("wan");
    await studio.treatNextAudio();
    const page = await (await call(new Request(`${SITE}/video/${video.id}`, { headers: { cookie: await cookie() } }), api, audio)).text();
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

  it("conta comum não pede a edição rápida de um vídeo do HeyGen, nem dela", async () => {
    const { api, audio, video } = await pronto("heygen");
    const member = await memberCookie();
    await env.DB.prepare("UPDATE videos SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(video.id).run();
    const res = await pedir(video.id, api, audio, member);
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
    const [video] = await new Db(env.DB).recentVideos();
    const page = await (await call(new Request(`${SITE}/video/${video!.id}`, { headers: { cookie: await cookie() } }), api, audio)).text();
    const source = /const planParts = ([\s\S]*?);\n {2}const qe = /.exec(page)?.[1];
    expect(source).toBeTruthy();
    const copia = new Function(`return (${source})`)() as typeof planParts;
    const falas = [[0.5, 4], [4.4, 5.1], [5.5, 9], [10, 12]];
    expect(copia(silencios(falas, 12.5), 12.5, 0.2, [1, 1.25, 1, 1.5], RULES)).toEqual(planParts(silencios(falas, 12.5), 12.5, 0.2, [1, 1.25, 1, 1.5], RULES));
  });
});
