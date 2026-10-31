import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { Studio } from "../src/studio";
import { call, cookie, FakeAudioApi, FakeHeyGenApi, FakeVideoApi, memberCookie, postForm, SITE } from "./helpers";

const FALA = "Oi, gente! Hoje eu vou mostrar como eu faço meus vídeos.";
const db = () => new Db(env.DB);
const foto = (texto = "foto-do-avatar") => new File([new TextEncoder().encode(texto)], "principal.png", { type: "image/png" });
const get = (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }));

/** Cria o avatar pelo formulário e devolve o id. */
async function criar(session: string, fields: Record<string, string | File>) {
  const res = await call(postForm("/avatares", fields, { cookie: session }));
  expect(res.status).toBe(303);
  return res.headers.get("location")!.split("/").pop()!;
}

describe("avatares", () => {
  it("Novo avatar só abre o formulário: nada é salvo até tocar em Salvar", async () => {
    const session = await cookie();
    expect((await get("/avatares/novo", session)).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM avatars").first("n")).toBe(0);
    const res = await call(postForm("/avatares", { nome: " " }, { cookie: session }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(ERROS.avatarNome);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM avatars").first("n")).toBe(0);
  });

  it("arquivo errado no formulário não cria o avatar", async () => {
    const res = await call(postForm("/avatares", { nome: "Camila", imagem: new File(["x"], "nota.txt", { type: "text/plain" }) }, { cookie: await cookie() }));
    expect(res.status).toBe(400);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM avatars").first("n")).toBe(0);
  });

  it("Salvar guarda nome, descrição, foto principal e voz, e a foto vira a capa", async () => {
    const session = await cookie();
    const id = await criar(session, { nome: "Camila", descricao: "Fala de beleza", imagem: foto(), voz: new File(["voz"], "voz.mp3", { type: "audio/mpeg" }) });
    const avatar = await db().avatarById(id);
    expect(avatar).toMatchObject({ name: "Camila", description: "Fala de beleza" });
    const assets = await db().assetsByAvatar(id);
    expect(assets.map((a) => a.kind).sort()).toEqual(["audio", "imagem"]);
    expect(avatar!.photo_asset).toBe(assets.find((a) => a.kind === "imagem")!.id);
    expect(avatar!.voice_asset).toBe(assets.find((a) => a.kind === "audio")!.id);
    expect(await (await get("/avatares", session)).text()).toContain(`/avatares/${id}/arquivos/${avatar!.photo_asset}`);
  });

  it("apagar a foto principal esvazia o lugar dela; apagar o avatar tira os arquivos do R2", async () => {
    const session = await cookie();
    const id = await criar(session, { nome: "Camila", imagem: foto() });
    const [asset] = await db().assetsByAvatar(id);
    await call(postForm(`/avatares/${id}/arquivos/${asset!.id}/apagar`, {}, { cookie: session }));
    expect((await db().avatarById(id))!.photo_asset).toBeNull();
    expect(await env.MIDIA.get(asset!.key)).toBeNull();
    const id2 = await criar(session, { nome: "Outra", imagem: foto() });
    const [asset2] = await db().assetsByAvatar(id2);
    await call(postForm(`/avatares/${id2}/apagar`, {}, { cookie: session }));
    expect(await db().avatarById(id2)).toBeNull();
    expect(await env.MIDIA.get(asset2!.key)).toBeNull();
  });

  it("o avatar e os ativos são só de quem criou", async () => {
    const id = await criar(await cookie(), { nome: "Camila", imagem: foto() });
    const [asset] = await db().assetsByAvatar(id);
    const member = await memberCookie();
    expect((await get(`/avatares/${id}`, member)).status).toBe(404);
    expect((await get(`/avatares/${id}/arquivos/${asset!.id}`, member)).status).toBe(404);
    expect((await call(postForm(`/avatares/${id}/apagar`, {}, { cookie: member }))).status).toBe(404);
    expect(await db().avatarById(id)).not.toBeNull();
  });
});

describe("vídeo com avatar ou arquivo solto", () => {
  it("com avatar, a foto dele vai para o modelo e o vídeo fica vinculado", async () => {
    const session = await cookie();
    const id = await criar(session, { nome: "Camila", imagem: foto() });
    await db().setPlatform("heygen");
    const heygen = new FakeHeyGenApi();
    const res = await call(postForm("/modelo/heygen", { fonte: "pronta", voz: "voz-rui", fala: FALA, avatar: id }, { cookie: session }), new FakeVideoApi(), null, heygen);
    expect(res.status).toBe(303);
    expect(heygen.assets[0]).toMatchObject({ type: "image/png", text: "foto-do-avatar" });
    const [video] = await db().recentVideos();
    expect(video!.avatar_id).toBe(id);
    await db().updateVideo(video!.id, { status: "completed", video_key: `videos/${video!.id}.mp4` });
    const page = await (await call(new Request(`${SITE}/video/${video!.id}`, { headers: { cookie: session } }), new FakeVideoApi(), null, heygen)).text();
    expect(page).toContain("Usado neste vídeo");
    expect(page).toContain(">Camila<");
  });

  it("com arquivo solto, o vídeo não tem avatar", async () => {
    const api = new FakeVideoApi();
    await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA, imagem: foto() }, { cookie: await cookie() }), api);
    const [video] = await db().recentVideos();
    expect(video!.avatar_id).toBeNull();
    expect(api.submitted).toHaveLength(1);
  });

  it("avatar de outra pessoa ou sem foto não serve", async () => {
    const dono = await cookie();
    const alheio = await criar(dono, { nome: "Camila", imagem: foto() });
    const semFoto = await criar(dono, { nome: "Sem foto" });
    const api = new FakeVideoApi();
    const res = await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA, avatar: alheio }, { cookie: await memberCookie() }), api);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(ERROS.avatarSemFoto);
    expect((await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA, avatar: semFoto }, { cookie: dono }), api)).status).toBe(400);
    expect(api.submitted).toHaveLength(0);
  });

  it("Novo avatar a partir do vídeo leva o vídeo junto: só salva com o avatar, ao tocar em Salvar", async () => {
    const session = await cookie();
    const api = new FakeVideoApi();
    await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA }, { cookie: session }), api);
    const [video] = await db().recentVideos();
    await env.MIDIA.put(`videos/${video!.id}.mp4`, "mp4");
    await db().updateVideo(video!.id, { status: "completed", video_key: `videos/${video!.id}.mp4` });

    expect(await (await get(`/video/${video!.id}`, session)).text()).toContain(`href="/avatares/novo?video=${video!.id}"`);
    const page = await (await get(`/avatares/novo?video=${video!.id}`, session)).text();
    expect(page).toContain(`name="video" value="${video!.id}"`);
    expect(page).toContain(`/videos/${video!.id}.mp4`);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM avatars").first("n")).toBe(0);

    // Sem nome, a página volta com o vídeo ainda junto.
    const erro = await call(postForm("/avatares", { nome: "", video: video!.id }, { cookie: session }));
    expect(erro.status).toBe(400);
    expect(await erro.text()).toContain(`name="video" value="${video!.id}"`);

    const id = await criar(session, { nome: "Camila", video: video!.id });
    const [asset] = await db().assetsByAvatar(id);
    expect(asset).toMatchObject({ kind: "video", source_video: video!.id });
    expect(asset!.key).toBe(`videos/${video!.id}.mp4`);
  });

  it("vídeo de outra pessoa ou que não existe não entra no avatar novo", async () => {
    const session = await cookie();
    const api = new FakeVideoApi();
    await call(postForm("/modelo/heygen", { fala: FALA, voz: "80441555167a467e967ab9487d844a30", imagem: foto() }, { cookie: session }), api);
    const [video] = await db().recentVideos();
    await env.MIDIA.put(`videos/${video!.id}.mp4`, "mp4");
    await db().updateVideo(video!.id, { status: "completed", video_key: `videos/${video!.id}.mp4` });
    // O HeyGen é só do administrador: a conta comum não vê este vídeo.
    const id = await criar(await memberCookie(), { nome: "Minha", video: video!.id });
    expect(await db().assetsByAvatar(id)).toHaveLength(0);
  });

  /** Um vídeo pronto salvo num avatar novo. */
  async function vinculado(session: string) {
    const id = await criar(session, { nome: "Camila" });
    const api = new FakeVideoApi();
    await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA }, { cookie: session }), api);
    const [video] = await db().recentVideos();
    await env.MIDIA.put(`videos/${video!.id}.mp4`, "mp4");
    await db().updateVideo(video!.id, { status: "completed", video_key: `videos/${video!.id}.mp4` });
    expect((await call(postForm(`/videos/${video!.id}/salvar-avatar`, { avatar: id }, { cookie: session }), api)).status).toBe(303);
    const [asset] = await db().assetsByAvatar(id);
    return { id, api, video: (await db().videoById(video!.id))!, asset: asset! };
  }
  const abrir = (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }));

  it("Salvar no avatar liga o vídeo sem copiar; a pessoa só salva nos avatares dela", async () => {
    const session = await cookie();
    const { id, api, video, asset } = await vinculado(session);
    expect(asset).toMatchObject({ kind: "video", source_video: video.id, key: video.video_key, size: 3 });
    const { objects } = await env.MIDIA.list({ prefix: `avatares-ativos/${id}/` });
    expect(objects).toHaveLength(0);
    expect(await (await abrir(`/avatares/${id}/arquivos/${asset.id}/ver`, session)).text()).toContain("Vídeo gerado");
    expect((await call(postForm(`/videos/${video.id}/salvar-avatar`, { avatar: id }, { cookie: await memberCookie() }), api)).status).toBe(404);
  });

  it("o ativo gerado mostra a versão que vale do vídeo", async () => {
    const session = await cookie();
    const { id, video, asset } = await vinculado(session);
    const editado = `videos/${video.id}.editado.mp4`;
    await env.MIDIA.put(editado, "editado");
    await db().updateVideo(video.id, { edited_key: editado });
    expect(await (await abrir(`/avatares/${id}/arquivos/${asset.id}`, session)).text()).toBe("editado");
  });

  it("a migration aponta a cópia antiga para o vídeo e o arquivo enviado não muda", async () => {
    const session = await cookie();
    const { id, video, asset } = await vinculado(session);
    await env.DB.prepare("UPDATE avatar_assets SET key = 'avatares-ativos/copia' WHERE id = ?").bind(asset.id).run();
    await db().insertAsset({ id: crypto.randomUUID(), avatar_id: id, kind: "imagem", key: "avatares-ativos/foto", name: "foto", type: "image/png", size: 1, source_video: null });
    await env.DB.exec((await import("../migrations/0014_assets_gerados.sql?raw")).default.replace(/--.*\n/g, "").replace(/\s+/g, " "));
    const keys = (await db().assetsByAvatar(id)).map((a) => a.key).sort();
    expect(keys).toEqual(["avatares-ativos/foto", video.video_key]);
  });

  it("a capa do avatar enquadra o rosto achado pelo agendamento", async () => {
    const session = await cookie();
    const id = await criar(session, { nome: "Camila" });
    const f = new FormData();
    f.set("arquivo", new File(["mp4-falso"], "rosto.png", { type: "image/png" }));
    expect((await call(new Request(`${SITE}/avatares/${id}/arquivos`, { method: "POST", body: f, headers: { origin: SITE, cookie: session } }))).status).toBe(303);
    const antes = await (await abrir("/avatares", session)).text();
    expect(antes).toContain('data-face="0.5,0.35"');
    const audio = new FakeAudioApi();
    const studio = new Studio(db(), env.MIDIA, new FakeVideoApi(), { siteUrl: SITE }, audio);
    await studio.findNextAssetFace();
    await studio.findNextAssetFace();
    expect(audio.faces).toBe(1);
    expect(await (await abrir("/avatares", session)).text()).toContain('data-face="0.46,0.44"');
    expect(await (await abrir(`/avatares/${id}`, session)).text()).toContain('data-face="0.46,0.44"');
  });

  it("o vídeo na lista de ativos enquadra o rosto, como a imagem", async () => {
    const session = await cookie();
    const { id, asset } = await vinculado(session);
    await env.MIDIA.put(asset.key, "mp4-falso");
    const audio = new FakeAudioApi();
    await new Studio(db(), env.MIDIA, new FakeVideoApi(), { siteUrl: SITE }, audio).findNextAssetFace();
    expect(audio.faces).toBe(1);
    expect(await (await abrir(`/avatares/${id}`, session)).text()).toMatch(/<video data-src="[^"]+" data-face="0\.46,0\.44"/);
  });

  it("apagar o ativo gerado ou o avatar não apaga o vídeo", async () => {
    const session = await cookie();
    const { id, video, asset } = await vinculado(session);
    expect((await call(postForm(`/avatares/${id}/arquivos/${asset.id}/apagar`, {}, { cookie: session }))).status).toBe(303);
    expect(await db().assetsByAvatar(id)).toHaveLength(0);
    expect(await env.MIDIA.head(video.video_key!)).not.toBeNull();
    const outro = await vinculado(session);
    expect((await call(postForm(`/avatares/${outro.id}/apagar`, {}, { cookie: session }))).status).toBe(303);
    expect(await env.MIDIA.head(outro.video.video_key!)).not.toBeNull();
  });
});
