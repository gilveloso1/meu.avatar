import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { createStudio } from "../src/index";
import { MOTION_GUIDE, VOICES } from "../src/structures/heygen";
import { resetVoiceCache } from "../src/studio";
import { call, cookie, FakeHeyGenApi, FakeVideoApi, memberCookie, postForm, SITE } from "./helpers";

const FALA = "Oi, gente! Hoje eu vou mostrar como eu faço meus vídeos.";
const foto = () => new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
const mp3 = (text = "fala") => new File([new TextEncoder().encode(text)], "fala.mp3", { type: "audio/mpeg" });

const db = () => new Db(env.DB);
beforeEach(async () => {
  resetVoiceCache();
  await env.DB.prepare("DELETE FROM config WHERE key = 'vozes.heygen'").run();
});
const useHeyGen = () => db().setPlatform("heygen");

async function post(heygen: FakeHeyGenApi | null, fields: Record<string, string | File>, api = new FakeVideoApi()) {
  return call(postForm("/modelo/heygen", fields, { cookie: await cookie() }), api, null, heygen);
}

const page = async (heygen: FakeHeyGenApi | null, session?: string) =>
  (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: session ?? (await cookie()) } }), new FakeVideoApi(), null, heygen)).text();

describe("HeyGen: plataforma pelo banco", () => {
  it("por padrão segue pelo OpenRouter, com o formulário de antes", async () => {
    const html = await page(new FakeHeyGenApi());
    expect(html).toContain(`data-voice-name>${VOICES[0]!.name}<`);
    expect(html).not.toContain('name="fonte"');
  });

  it("com a config na HeyGen direta, mostra as três vozes e o catálogo da HeyGen", async () => {
    await useHeyGen();
    const html = await page(new FakeHeyGenApi());
    expect(html).toContain("Voz pronta");
    expect(html).toContain("Voz clonada");
    expect(html).toContain("Meu áudio");
    expect(html).toContain("data-voice-name>Ana<");
    expect(html).toContain("Feminina · Português");
    expect(html).toContain("Clonar uma voz nova");
    // A API direta aceita 4:5; o OpenRouter não.
    expect(html).toContain('value="4:5"');
  });

  const list = async (api: FakeHeyGenApi, query: string, session?: string) =>
    call(new Request(`${SITE}/vozes/lista?${query}`, { headers: { cookie: session ?? (await cookie()) } }), new FakeVideoApi(), null, api);

  it("o menu lista todos os idiomas, com Multilíngue à parte, e a página não traz as vozes", async () => {
    await useHeyGen();
    const api = new FakeHeyGenApi();
    api.catalog = [
      { voice_id: "en1", name: "Sara", language: "English", gender: "female", support_locale: false, preview_audio_url: "https://files.heygen.ai/voz/sara.mp3" },
      { voice_id: "en2", name: "Joe", language: "en", gender: "male", support_locale: false },
      { voice_id: "tr1", name: "Ada", language: "Turkey", gender: "female", support_locale: false },
      { voice_id: "pt1", name: "Lucilene", language: "Portuguese", gender: "female", support_locale: false },
      { voice_id: "x1", name: "Sem", language: "", gender: "unknown", support_locale: false },
    ];
    const html = await page(api);
    const select = html.slice(html.indexOf("data-voice-language"), html.indexOf("</select>", html.indexOf("data-voice-language")));
    const options = [...select.matchAll(/<option value="([^"]*)"(?: selected)?>([^<]+)</g)].map((m) => m[2]);
    expect(options.slice(0, 2)).toEqual(["Português (1)", "Multilíngue (2)"]);
    expect(options).toContain("Inglês (4)");
    expect(options).toContain("Turco (1)");
    expect(options.at(-2)).toBe("Sem idioma definido (1)");
    expect(options.at(-1)).toBe("Todos os idiomas (11)");
    expect(html).toContain('name="voz" value="pt1"');
    expect(html).not.toContain("data-voice=");
  });

  it("a lista traz só o idioma pedido, e Português não mistura Multilíngue", async () => {
    await useHeyGen();
    const api = new FakeHeyGenApi();
    const pt = await (await list(api, "idioma=Portugu%C3%AAs")).text();
    expect(pt).toContain('data-name="Ana"');
    expect(pt).not.toContain('data-name="Kore"');
    const multi = await (await list(api, "idioma=Multil%C3%ADngue")).text();
    expect(multi).toContain('data-voice-play="/vozes/previa/80441555167a467e967ab9487d844a30"');
    expect(multi).not.toContain('data-name="Ana"');
    expect(await (await list(api, "idioma=&busca=kor")).text()).toContain('data-name="Kore"');
    expect(await (await list(api, "idioma=Portugu%C3%AAs&genero=male")).text()).toContain('data-name="Rui"');
  });

  it("a lista vem em páginas e só para quem pode usar o modelo", async () => {
    await useHeyGen();
    const api = new FakeHeyGenApi();
    api.catalog = Array.from({ length: 60 }, (_, i) => ({ voice_id: `v${i}`, name: `Voz ${i}`, language: "English", gender: "female", support_locale: false }));
    const first = await (await list(api, "idioma=Ingl%C3%AAs")).text();
    expect(first).toContain('data-voice-more="50"');
    expect(first.match(/data-voice="/g)).toHaveLength(50);
    const rest = await (await list(api, "idioma=Ingl%C3%AAs&de=50")).text();
    expect(rest).not.toContain("data-voice-more");
    expect(rest.match(/data-voice="/g)).toHaveLength(12);
    expect((await list(api, "idioma=", await memberCookie())).status).toBe(404);
  });

  it("guarda o catálogo no banco: a instância nova não pede à HeyGen de novo", async () => {
    await useHeyGen();
    const api = new FakeHeyGenApi();
    const voices = vi.spyOn(api, "voices");
    resetVoiceCache();
    await page(api);
    resetVoiceCache();
    await page(api);
    expect(voices).toHaveBeenCalledTimes(1);
  });

  it("a prévia da voz vem pelo site, e só para quem pode usar o modelo", async () => {
    await useHeyGen();
    const api = new FakeHeyGenApi();
    api.catalog = [{ voice_id: "en1", name: "Sara", language: "English", gender: "female", support_locale: false, preview_audio_url: "https://files.heygen.ai/voz/sara.mp3" }];
    resetVoiceCache();
    const get = async (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }), new FakeVideoApi(), null, api);
    const ok = await get("/vozes/previa/en1", await cookie());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("audio/mpeg");
    expect(api.downloads).toContain("https://files.heygen.ai/voz/sara.mp3");
    expect((await get("/vozes/previa/nao-existe", await cookie())).status).toBe(404);
    expect((await get("/vozes/previa/en1", await memberCookie())).status).toBe(404);
  });

  it("com a config na HeyGen direta mas sem a chave, segue pelo OpenRouter", async () => {
    await useHeyGen();
    const html = await page(null);
    expect(html).not.toContain('name="fonte"');
    const api = new FakeVideoApi();
    await post(null, { fala: FALA, voz: VOICES[0]!.value, imagem: foto() }, api);
    expect(api.submitted).toHaveLength(1);
  });

  it("vídeos feitos pelo OpenRouter continuam no OpenRouter depois da troca", async () => {
    const api = new FakeVideoApi();
    await post(null, { fala: FALA, voz: VOICES[0]!.value, imagem: foto() }, api);
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    const [video] = await db().recentVideos();
    api.finish(video!.job_id!, { status: "completed" });
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api, heygen });
    expect((await studio.sync(video!)).status).toBe("completed");
    expect(heygen.downloads).toHaveLength(0);
  });
});

describe("HeyGen direta: gerar", () => {
  it("voz pronta: sobe a foto, pede o vídeo com o texto, a voz e o sotaque pt-BR", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    const res = await post(heygen, { fonte: "pronta", voz: "voz-ana|pt-BR", fala: FALA, imagem: foto(), formato: "4:5", expressividade: "medium", movimento: "acena" });
    expect(res.status).toBe(303);
    const [body] = heygen.videos;
    expect(heygen.assets[0]).toMatchObject({ type: "image/png" });
    expect(body).toMatchObject({
      type: "image",
      image: { type: "asset_id", asset_id: heygen.assets[0]!.id },
      script: FALA,
      voice_id: "voz-ana",
      voice_settings: { locale: "pt-BR" },
      aspect_ratio: "4:5",
      resolution: "720p",
      expressiveness: "medium",
      motion_prompt: `${MOTION_GUIDE} acena`,
      callback_url: `${SITE}/heygen/webhook`,
    });
    const [video] = await db().recentVideos();
    expect(body!.callback_id).toBe(video!.id);
    expect(video).toMatchObject({ job_id: "hg-2", status: "pending", structure: "heygen", prompt: FALA });
    expect(JSON.parse(video!.settings!)).toMatchObject({ platform: "heygen", source: "pronta", voice_id: "voz-ana", voice: "Ana · feminina · português" });
  });

  it("voz pronta sem sotaque: não manda o locale", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "pronta", voz: "voz-rui", fala: FALA, imagem: foto() });
    expect(heygen.videos[0]!.voice_settings).toBeUndefined();
  });

  it("meu áudio: sobe o áudio e pede o vídeo sem texto", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "audio", audio: mp3("minha-fala"), imagem: foto() });
    const [body] = heygen.videos;
    const audio = heygen.assets.find((a) => a.type === "audio/mpeg")!;
    expect(audio.text).toBe("minha-fala");
    expect(body!.audio_asset_id).toBe(audio.id);
    expect(body!.script).toBeUndefined();
    expect(body!.voice_id).toBeUndefined();
    const [video] = await db().recentVideos();
    expect(video!.prompt).toBe("Meu áudio");
    expect(JSON.parse(video!.settings!).audio_key).toMatch(/^audios\/[0-9a-f-]{36}\.mp3$/);
  });

  it("recusa o que falta ou não serve, sem chamar a HeyGen", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    const casos: [Record<string, string | File>, string][] = [
      [{ fonte: "pronta", voz: "voz-ana|pt-BR", fala: FALA }, ERROS.foto],
      [{ fonte: "pronta", voz: "outra", fala: FALA, imagem: foto() }, ERROS.voz],
      [{ fonte: "pronta", voz: "voz-ana|pt-BR", fala: " ", imagem: foto() }, ERROS.fala],
      [{ fonte: "audio", imagem: foto() }, ERROS.audioFala],
      [{ fonte: "audio", audio: new File(["x"], "fala.ogg", { type: "audio/ogg" }), imagem: foto() }, ERROS.audioTipo],
      [{ fonte: "clonada", clone: "nova", nome_voz: "Minha voz", fala: FALA, imagem: foto(), amostra: mp3() }, ERROS.consentimentoVoz],
      [{ fonte: "clonada", clone: "nova", consentimento: "sim", fala: FALA, imagem: foto(), amostra: mp3() }, ERROS.nomeVoz],
      [{ fonte: "clonada", clone: "nova", nome_voz: "Minha voz", consentimento: "sim", fala: FALA, imagem: foto() }, ERROS.amostraVoz],
      [{ fonte: "clonada", clone: "de-outra-pessoa", fala: FALA, imagem: foto() }, ERROS.vozClonada],
    ];
    for (const [fields, erro] of casos) {
      const res = await post(heygen, fields);
      expect(res.status, erro).toBe(400);
      expect(await res.text()).toContain(erro.replace(/ /g, " "));
    }
    expect(heygen.videos).toHaveLength(0);
    expect(heygen.clones).toHaveLength(0);
  });

  it("voz clonada nova: clona, espera a voz ficar pronta, transforma o texto em áudio e pede o vídeo", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "clonada", clone: "nova", nome_voz: "Minha voz", consentimento: "sim", fala: FALA, imagem: foto(), amostra: mp3("amostra") });
    expect(heygen.clones).toHaveLength(1);
    expect(heygen.assets.find((a) => a.id === heygen.clones[0]!.assetId)!.text).toBe("amostra");
    let [video] = await db().recentVideos();
    expect(video).toMatchObject({ status: "submitting", prep_status: "voz", job_id: null });
    expect(heygen.videos).toHaveLength(0);

    const studio = createStudio({ ...env, SITE_URL: SITE }, { api: new FakeVideoApi(), heygen });
    // Ainda clonando: nada muda.
    await studio.voiceNext();
    expect(heygen.videos).toHaveLength(0);

    const [voice] = await db().voicesByUser(video!.user_id!);
    heygen.cloneStatuses.set(voice!.provider_voice_id, { status: "ACTIVE" });
    await studio.voiceNext();
    expect(heygen.speeches).toEqual([{ voiceId: voice!.provider_voice_id, text: FALA }]);
    expect(heygen.videos[0]).toMatchObject({ audio_url: `https://files.heygen.ai/audio/${voice!.provider_voice_id}.wav`, callback_id: video!.id });
    expect(heygen.videos[0]!.script).toBeUndefined();
    [video] = await db().recentVideos();
    expect(video).toMatchObject({ status: "pending", prep_status: "done" });
    expect((await db().voiceById(voice!.id))!.status).toBe("ACTIVE");

    // A voz pronta aparece na lista e o próximo vídeo sai na hora.
    expect(await page(heygen)).toContain(`value="${voice!.id}"`);
    await post(heygen, { fonte: "clonada", clone: voice!.id, fala: "Segundo vídeo.", imagem: foto() });
    expect(heygen.videos).toHaveLength(2);
    expect(heygen.clones).toHaveLength(1);
    expect(heygen.speeches[1]).toEqual({ voiceId: voice!.provider_voice_id, text: "Segundo vídeo." });
  });

  /** Um avatar com gravação de voz, direto no banco e no R2. */
  async function avatarComVoz(user_id: number, gravacao = new TextEncoder().encode("gravacao-do-avatar")) {
    const id = crypto.randomUUID(), voz = crypto.randomUUID(), key = `avatares-ativos/${id}/${voz}`;
    const agora = new Date().toISOString();
    await env.DB.prepare("INSERT INTO avatars (id, user_id, name, voice_asset, created_at, updated_at) VALUES (?, ?, 'Marina', ?, ?, ?)").bind(id, user_id, voz, agora, agora).run();
    await env.MIDIA.put(key, gravacao);
    await db().insertAsset({ id: voz, avatar_id: id, kind: "audio", key, name: "voz.mp3", type: "audio/mpeg", size: gravacao.byteLength, source_video: null });
    return { id, voz, valor: `avatar:${id}` };
  }
  const dono = async () => (await env.DB.prepare("SELECT id FROM users LIMIT 1").first<{ id: number }>())!.id;

  it("a voz do avatar entra na lista, pede consentimento, é clonada uma vez só e fica pronta para os próximos", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    const session = await cookie();
    const { valor, voz } = await avatarComVoz(await dono());
    expect(await page(heygen, session)).toContain("Voz de Marina");
    const envia = (fields: Record<string, string | File>) => call(postForm("/modelo/heygen", fields, { cookie: session }), new FakeVideoApi(), null, heygen);
    expect(await (await envia({ fonte: "clonada", clone: valor, fala: FALA, imagem: foto() })).text()).toContain(ERROS.consentimentoVoz.replace(/ /g, " "));
    expect(heygen.clones).toHaveLength(0);

    await envia({ fonte: "clonada", clone: valor, consentimento: "sim", fala: FALA, imagem: foto() });
    expect(heygen.clones).toHaveLength(1);
    expect(heygen.assets.find((a) => a.id === heygen.clones[0]!.assetId)!.text).toBe("gravacao-do-avatar");
    const voice = (await db().voiceByAsset(voz))!;
    expect(voice).toMatchObject({ name: "Voz de Marina", status: "PENDING" });
    heygen.cloneStatuses.set(voice.provider_voice_id, { status: "ACTIVE" });
    await createStudio({ ...env, SITE_URL: SITE }, { api: new FakeVideoApi(), heygen }).voiceNext();
    expect(heygen.videos).toHaveLength(1);

    // Já clonada: sem consentimento de novo, sem clonar de novo e sem repetir na lista.
    const depois = await page(heygen, session);
    expect(depois.match(/Voz de Marina/g)!.length).toBe(1);
    expect(depois).not.toContain(`value="${voice.id}"`);
    await envia({ fonte: "clonada", clone: valor, fala: "Segundo vídeo.", imagem: foto() });
    expect([heygen.clones.length, heygen.videos.length]).toEqual([1, 2]);
  });

  it("trocar a gravação do avatar clona a voz de novo", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    const session = await cookie();
    const { id, valor, voz } = await avatarComVoz(await dono());
    await call(postForm("/modelo/heygen", { fonte: "clonada", clone: valor, consentimento: "sim", fala: FALA, imagem: foto() }, { cookie: session }), new FakeVideoApi(), null, heygen);
    const nova = crypto.randomUUID(), key = `avatares-ativos/${id}/${nova}`;
    await env.MIDIA.put(key, "outra-gravacao");
    await db().insertAsset({ id: nova, avatar_id: id, kind: "audio", key, name: "nova.mp3", type: "audio/mpeg", size: 14, source_video: null });
    await env.DB.prepare("UPDATE avatars SET voice_asset = ? WHERE id = ?").bind(nova, id).run();
    await call(postForm("/modelo/heygen", { fonte: "clonada", clone: valor, consentimento: "sim", fala: FALA, imagem: foto() }, { cookie: session }), new FakeVideoApi(), null, heygen);
    expect(heygen.clones).toHaveLength(2);
    expect(await db().voiceByAsset(voz)).not.toBeNull();
    expect((await db().voiceByAsset(nova))!.name).toBe("Voz de Marina");
  });

  it("voz do avatar de outra pessoa não entra", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    const session = await cookie();
    const outro = await env.DB.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES ('outra@exemplo.com', 'Outra', 'member', NULL, ?) RETURNING id").bind(new Date().toISOString()).first<{ id: number }>();
    const { valor } = await avatarComVoz(outro!.id);
    expect(await page(heygen, session)).not.toContain(valor);
    const res = await call(postForm("/modelo/heygen", { fonte: "clonada", clone: valor, consentimento: "sim", fala: FALA, imagem: foto() }, { cookie: session }), new FakeVideoApi(), null, heygen);
    expect([res.status, heygen.clones.length]).toEqual([400, 0]);
  });

  it("se a clonagem falhar, o vídeo falha", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "clonada", clone: "nova", nome_voz: "Minha voz", consentimento: "sim", fala: FALA, imagem: foto(), amostra: mp3() });
    const [video] = await db().recentVideos();
    const [voice] = await db().voicesByUser(video!.user_id!);
    heygen.cloneStatuses.set(voice!.provider_voice_id, { status: "FAILED", failure_reason: "INVALID_AUDIO" });
    await createStudio({ ...env, SITE_URL: SITE }, { api: null, heygen }).voiceNext();
    expect((await db().videoById(video!.id))!.status).toBe("failed");
    expect((await db().voiceById(voice!.id))!.status).toBe("FAILED");
    expect(heygen.videos).toHaveLength(0);
  });

  it("a voz clonada de uma pessoa não serve para outra", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "clonada", clone: "nova", nome_voz: "Voz do Gil", consentimento: "sim", fala: FALA, imagem: foto(), amostra: mp3() });
    const [video] = await db().recentVideos();
    const [voice] = await db().voicesByUser(video!.user_id!);
    const member = await memberCookie();
    expect(await page(heygen, member)).not.toContain(voice!.id);
  });

  it("se a HeyGen recusar, o vídeo fica como falhou, com o motivo", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    heygen.failVideo = "HeyGen respondeu HTTP 402 insufficient_credit";
    await post(heygen, { fonte: "pronta", voz: "voz-rui", fala: FALA, imagem: foto() });
    const [video] = await db().recentVideos();
    expect(video).toMatchObject({ status: "failed", error: "HeyGen respondeu HTTP 402 insufficient_credit" });
  });
});

describe("HeyGen direta: acompanhar", () => {
  it("pronto: baixa o MP4, a duração e o custo saem da HeyGen", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "pronta", voz: "voz-rui", fala: FALA, imagem: foto() });
    const [video] = await db().recentVideos();
    const studio = createStudio({ ...env, SITE_URL: SITE }, { api: null, heygen });

    heygen.finish(video!.job_id!, { status: "processing" });
    expect((await studio.syncOpen())[0]!.status).toBe("in_progress");

    heygen.finish(video!.job_id!, { status: "completed", video_url: "https://files.heygen.ai/v.mp4", duration: 12.4 });
    const [done] = await studio.syncOpen();
    expect(done).toMatchObject({ status: "completed", video_key: `videos/${video!.id}.mp4`, duration: 12, cost: 0.4774, audio_status: null });
    expect(heygen.downloads).toEqual(["https://files.heygen.ai/v.mp4"]);
    expect(await (await env.MIDIA.get(done!.video_key!))!.text()).toBe("mp4-heygen");
    // A duração que a HeyGen devolve é a certa: sem o "≈" da estimativa pela fala.
    const html = await (await call(new Request(`${SITE}/video/${video!.id}`, { headers: { cookie: await cookie() } }), null, null, heygen)).text();
    expect(html).toContain(">12 s<");
    expect(html).not.toContain("≈ 12 s");
  });

  it("depois de salvar no R2, apaga na HeyGen o vídeo, a foto e o áudio", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "audio", audio: mp3(), imagem: foto() });
    const [video] = await db().recentVideos();
    const enviados = heygen.assets.map((a) => a.id);
    expect(JSON.parse(video!.settings!).heygen_assets).toBe(enviados.join(","));
    heygen.finish(video!.job_id!, { status: "completed", video_url: "https://files.heygen.ai/v.mp4", duration: 5 });
    const [done] = await createStudio({ ...env, SITE_URL: SITE }, { api: null, heygen }).syncOpen();
    expect(heygen.deletedVideos).toEqual([video!.job_id]);
    expect(heygen.deletedAssets).toEqual(enviados);
    const settings = JSON.parse(done!.settings!);
    expect(settings.heygen_video_deleted).toBe("sim");
    expect(settings.heygen_assets).toBeUndefined();
    // O vídeo continua no meu.avatar.
    expect(await (await env.MIDIA.get(done!.video_key!))!.text()).toBe("mp4-heygen");
  });

  it("se a HeyGen não deixar apagar, o vídeo fica pronto e os arquivos ficam anotados", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "pronta", voz: "voz-rui", fala: FALA, imagem: foto() });
    const [video] = await db().recentVideos();
    heygen.failDelete = true;
    heygen.finish(video!.job_id!, { status: "completed", video_url: "https://files.heygen.ai/v.mp4", duration: 5 });
    const [done] = await createStudio({ ...env, SITE_URL: SITE }, { api: null, heygen }).syncOpen();
    expect(done!.status).toBe("completed");
    const settings = JSON.parse(done!.settings!);
    expect(settings.heygen_assets).toBe(heygen.assets[0]!.id);
    expect(settings.heygen_video_deleted).toBeUndefined();
  });

  it("vídeo que falhou também é apagado na HeyGen, com a gravação da voz", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "clonada", clone: "nova", nome_voz: "Minha voz", consentimento: "sim", fala: FALA, imagem: foto(), amostra: mp3() });
    const [video] = await db().recentVideos();
    const [voice] = await db().voicesByUser(video!.user_id!);
    heygen.cloneStatuses.set(voice!.provider_voice_id, { status: "FAILED" });
    await createStudio({ ...env, SITE_URL: SITE }, { api: null, heygen }).voiceNext();
    expect(heygen.deletedAssets).toEqual(heygen.assets.map((a) => a.id));
  });

  it("falhou na HeyGen: guarda o motivo", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "pronta", voz: "voz-rui", fala: FALA, imagem: foto() });
    const [video] = await db().recentVideos();
    heygen.finish(video!.job_id!, { status: "failed", failure_code: "content_policy_violation", failure_message: "Imagem recusada" });
    const [done] = await createStudio({ ...env, SITE_URL: SITE }, { api: null, heygen }).syncOpen();
    expect(done).toMatchObject({ status: "failed", error: "content_policy_violation: Imagem recusada" });
  });

  it("o aviso da HeyGen confere o vídeo pela API (pelo callback_id ou pelo id da HeyGen)", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "pronta", voz: "voz-rui", fala: FALA, imagem: foto() });
    const [video] = await db().recentVideos();
    heygen.finish(video!.job_id!, { status: "completed", video_url: "https://files.heygen.ai/v.mp4", duration: 5 });
    const aviso = (body: unknown) => call(new Request(`${SITE}/heygen/webhook`, { method: "POST", body: JSON.stringify(body) }), null, null, heygen);
    // O corpo não decide nada: o status vem da API.
    expect((await aviso({ event_type: "avatar_video.success", event_data: { video_id: "outro", callback_id: video!.id } })).status).toBe(200);
    expect((await db().videoById(video!.id))!.status).toBe("completed");
    expect((await call(new Request(`${SITE}/heygen/webhook`, { method: "POST", body: "{" }), null, null, heygen)).status).toBe(400);
  });

  it("a página do vídeo mostra de onde veio a voz", async () => {
    await useHeyGen();
    const heygen = new FakeHeyGenApi();
    await post(heygen, { fonte: "pronta", voz: "voz-ana|pt-BR", fala: FALA, imagem: foto() });
    const [video] = await db().recentVideos();
    const html = await (await call(new Request(`${SITE}/video/${video!.id}`, { headers: { cookie: await cookie() } }), null, null, heygen)).text();
    expect(html).toContain("Voz pronta · Ana · feminina");
  });
});
