import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import dbSource from "../src/db.ts?raw";
import { call, cookie, FakeVideoApi, memberCookie, postForm, SITE } from "./helpers";

// Cada conta vê só os próprios vídeos: o de outra pessoa não existe para ela, nem pelo id.
// Um teste por caminho do site que lê ou mexe num vídeo.

const FALA = "Fala só de quem gerou, para ninguém mais ver.";
const db = () => new Db(env.DB);
const get = (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }));

/** Um vídeo do Wan pronto, da conta da sessão, com a foto de origem, o tratado e o editado no R2. */
async function pronto(session: string) {
  const foto = new File([new TextEncoder().encode("foto")], "foto.png", { type: "image/png" });
  expect((await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA, imagem: foto }, { cookie: session }), new FakeVideoApi())).status).toBe(303);
  const [video] = await db().recentVideos(1);
  const id = video!.id;
  for (const key of [`videos/${id}.mp4`, `videos/${id}.tratado.mp4`, `videos/${id}.editado.mp4`]) await env.MIDIA.put(key, "mp4", { httpMetadata: { contentType: "video/mp4" } });
  await db().updateVideo(id, { status: "completed", video_key: `videos/${id}.mp4`, processed_key: `videos/${id}.tratado.mp4`, edited_key: `videos/${id}.editado.mp4`, edited_at: new Date().toISOString() });
  return (await db().videoById(id))!;
}

async function membroId(): Promise<number> {
  return (await env.DB.prepare("SELECT id FROM users WHERE email = 'membro@exemplo.com'").first<{ id: number }>())!.id;
}

describe("vídeo de outra conta", () => {
  it("não aparece em Vídeos, nem na busca pela fala", async () => {
    const video = await pronto(await cookie());
    const membro = await memberCookie();
    expect(await (await get("/videos", membro)).text()).not.toContain(video.id);
    expect(await (await get(`/videos?q=${encodeURIComponent("ninguém mais")}`, membro)).text()).not.toContain(video.id);
  });

  it("não aparece na lista da página do modelo", async () => {
    const video = await pronto(await cookie());
    expect(await (await get("/modelo/wan", await memberCookie())).text()).not.toContain(video.id);
  });

  it("não entra na contagem do card do modelo", async () => {
    const admin = await cookie();
    await pronto(admin);
    expect(await (await get("/", admin)).text()).toContain("1 vídeo");
    const home = await (await get("/", await memberCookie())).text();
    expect(home).not.toContain("1 vídeo");
  });

  it("a página do vídeo não existe", async () => {
    const video = await pronto(await cookie());
    expect((await get(`/video/${video.id}`, await memberCookie())).status).toBe(404);
  });

  it("os arquivos (tratado, original e editado) não existem", async () => {
    const video = await pronto(await cookie());
    const membro = await memberCookie();
    for (const file of [`${video.id}.mp4`, `${video.id}.original.mp4`, `${video.id}.editado.mp4`, `${video.id}.mp4?baixar`]) {
      expect((await get(`/videos/${file}`, membro)).status).toBe(404);
    }
  });

  it("a foto usada para gerar não existe", async () => {
    const video = await pronto(await cookie());
    expect((await get(`/videos/${video.id}/referencia/imagem`, await memberCookie())).status).toBe(404);
  });

  it("não se pede o rosto", async () => {
    const video = await pronto(await cookie());
    expect((await get(`/videos/${video.id}/rosto`, await memberCookie())).status).toBe(404);
  });

  it("não se pede a edição rápida", async () => {
    const video = await pronto(await cookie());
    const res = await call(postForm(`/videos/${video.id}/edicao-rapida`, {}, { cookie: await memberCookie() }));
    expect(res.status).toBe(404);
    expect(await db().videoById(video.id)).toMatchObject({ edit_status: null });
  });

  it("não se salva num avatar da outra conta, nem abrindo o Novo avatar com ele", async () => {
    const video = await pronto(await cookie());
    const membro = await memberCookie();
    const avatar = crypto.randomUUID();
    const agora = new Date().toISOString();
    await env.DB.prepare("INSERT INTO avatars (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'Do membro', ?, ?)").bind(avatar, await membroId(), agora, agora).run();
    expect((await call(postForm(`/videos/${video.id}/salvar-avatar`, { avatar }, { cookie: membro }))).status).toBe(404);
    expect(await db().assetsByAvatar(avatar)).toHaveLength(0);
    expect(await (await get(`/avatares/novo?video=${video.id}`, membro)).text()).not.toContain(video.id);
  });

  it("o Refazer não traz nada dele", async () => {
    const video = await pronto(await cookie());
    const page = await (await get(`/modelo/wan?refazer=${video.id}`, await memberCookie())).text();
    expect(page).not.toContain(FALA);
    expect(page).not.toContain(video.id);
  });

  it("não aparece no Adicionar ativo (Mostrar mais)", async () => {
    const video = await pronto(await cookie());
    expect(await (await get("/gerados?tipo=video", await memberCookie())).text()).not.toContain(video.id);
  });
});

describe("o administrador e o vídeo de outra conta", () => {
  it("abre pelo painel só para ver: sem Refazer, Salvar no avatar nem Edição rápida", async () => {
    const admin = await cookie();
    const video = await pronto(await memberCookie());
    await env.DB.prepare("UPDATE videos SET user_id = ? WHERE id = ?").bind(await membroId(), video.id).run();
    const res = await get(`/video/${video.id}`, admin);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain(FALA);
    expect(page).not.toContain("?refazer=");
    expect(page).not.toContain("salvar-avatar");
    expect(page).not.toContain("edicao-rapida");
    expect((await get(`/videos/${video.id}.mp4`, admin)).status).toBe(200);
  });

  it("não vê o vídeo de outra conta nas listas dele", async () => {
    const admin = await cookie();
    const video = await pronto(admin);
    await env.DB.prepare("UPDATE videos SET user_id = ? WHERE id = ?").bind(await memberCookie().then(membroId), video.id).run();
    expect(await (await get("/videos", admin)).text()).not.toContain(video.id);
    expect(await (await get("/modelo/wan", admin)).text()).not.toContain(video.id);
  });

  it("não pede a edição rápida nem o Refazer do vídeo de outra conta", async () => {
    const admin = await cookie();
    const video = await pronto(admin);
    await env.DB.prepare("UPDATE videos SET user_id = ? WHERE id = ?").bind(await memberCookie().then(membroId), video.id).run();
    expect((await call(postForm(`/videos/${video.id}/edicao-rapida`, {}, { cookie: admin }))).status).toBe(404);
    expect(await (await get(`/modelo/wan?refazer=${video.id}`, admin)).text()).not.toContain(FALA);
  });
});

describe("ContaDb", () => {
  it("toda consulta leva o dono", () => {
    const body = dbSource.slice(dbSource.indexOf("export class ContaDb"));
    const sqls = [...body.matchAll(/\.prepare\(\s*(`[^`]*`|"[^"]*")/g)].map((m) => m[1]!);
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) expect(sql).toContain("user_id = ?1");
  });

  it("o vídeo de outra conta não existe, nem pelo id", async () => {
    const video = await pronto(await cookie());
    await memberCookie();
    const conta = db().conta(await membroId());
    expect(await conta.video(video.id)).toBeNull();
    expect(await conta.videos(["wan"])).toHaveLength(0);
    expect(await conta.ready(["wan"])).toHaveLength(0);
    expect((await conta.countByStructure()).size).toBe(0);
    expect(await db().conta(video.user_id!).video(video.id)).not.toBeNull();
  });
});
