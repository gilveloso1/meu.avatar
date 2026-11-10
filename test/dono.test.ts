import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { randomToken, sha256 } from "../src/auth";
import { Db } from "../src/db";
import dbSource from "../src/db.ts?raw";
import { call, cookie, FakeVideoApi, postForm, SITE } from "./helpers";

// Cada conta vê só os próprios vídeos: o de outra pessoa não existe para ela, nem pelo id.
// No molde dos testes do TabNews: cada caminho é pedido pelo dono (funciona), por outra conta
// (não existe), sem login e com a sessão vencida (vai para /entrar), e o id de outra conta
// responde igual a um id que não existe (não dá para descobrir quais existem).

const FALA = "Fala só de quem gerou, para ninguém mais ver.";
const db = () => new Db(env.DB);
const get = (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session ? { cookie: session } : {} }));

/** Uma conta comum com sessão aberta (vencida, com `vencida`). */
async function conta(email: string, vencida = false): Promise<{ id: number; session: string }> {
  const now = new Date().toISOString();
  const user = await env.DB.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, 'member', NULL, ?) ON CONFLICT (email) DO UPDATE SET name = name RETURNING id")
    .bind(email, email.split("@")[0], now)
    .first<{ id: number }>();
  const token = randomToken();
  const expires = new Date(Date.now() + (vencida ? -1 : 1) * 86_400_000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), user!.id, now, expires).run();
  return { id: user!.id, session: `__Host-sessao=${token}` };
}

/** Um vídeo do Wan pronto, da conta da sessão, com a foto de origem, o tratado e o editado no R2. */
async function pronto(session: string, extra: Record<string, string> = {}) {
  const foto = new File([new TextEncoder().encode("foto")], "foto.png", { type: "image/png" });
  expect((await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: FALA, imagem: foto, ...extra }, { cookie: session }), new FakeVideoApi())).status).toBe(303);
  const [video] = await db().recentVideos(1);
  const id = video!.id;
  for (const key of [`videos/${id}.mp4`, `videos/${id}.tratado.mp4`, `videos/${id}.editado.mp4`]) await env.MIDIA.put(key, "mp4", { httpMetadata: { contentType: "video/mp4" } });
  await db().updateVideo(id, { status: "completed", video_key: `videos/${id}.mp4`, processed_key: `videos/${id}.tratado.mp4`, edited_key: `videos/${id}.editado.mp4`, edited_at: new Date().toISOString() });
  return (await db().videoById(id))!;
}

/** Um avatar vazio da conta. */
async function avatarDe(userId: number): Promise<string> {
  const id = crypto.randomUUID();
  const agora = new Date().toISOString();
  await env.DB.prepare("INSERT INTO avatars (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'Avatar', ?, ?)").bind(id, userId, agora, agora).run();
  return id;
}

interface Cena {
  dona: { id: number; session: string };
  outra: { id: number; session: string };
  video: Awaited<ReturnType<typeof pronto>>;
}

async function cena(): Promise<Cena> {
  await cookie(); // o administrador existe, como no ar
  const dona = await conta("dona@exemplo.com");
  const outra = await conta("outra@exemplo.com");
  return { dona, outra, video: await pronto(dona.session) };
}

/**
 * Cada caminho do site que lê ou mexe num vídeo: o pedido e como se vê que ele valeu.
 * `ok` diz o que a dona recebe; `alheio` o que a outra conta recebe (sempre "o vídeo não existe").
 */
const CAMINHOS: {
  nome: string;
  pedir: (c: Cena, session?: string) => Promise<Response>;
  dona: (res: Response, c: Cena) => Promise<void>;
  outra: (res: Response, c: Cena) => Promise<void>;
}[] = [
  {
    nome: "lista de Vídeos",
    pedir: (_c, s) => get("/videos", s),
    dona: async (res, c) => expect(await res.text()).toContain(c.video.id),
    outra: async (res, c) => expect(await res.text()).not.toContain(c.video.id),
  },
  {
    nome: "busca pela fala em Vídeos",
    pedir: (_c, s) => get(`/videos?q=${encodeURIComponent("ninguém mais")}`, s),
    dona: async (res, c) => expect(await res.text()).toContain(c.video.id),
    outra: async (res, c) => expect(await res.text()).not.toContain(c.video.id),
  },
  {
    nome: "lista da página do modelo",
    pedir: (_c, s) => get("/modelo/wan", s),
    dona: async (res, c) => expect(await res.text()).toContain(c.video.id),
    outra: async (res, c) => expect(await res.text()).not.toContain(c.video.id),
  },
  {
    nome: "contagem do card do modelo",
    pedir: (_c, s) => get("/", s),
    dona: async (res) => expect(await res.text()).toContain("1 vídeo"),
    outra: async (res) => expect(await res.text()).not.toContain("1 vídeo"),
  },
  {
    nome: "página do vídeo",
    pedir: (c, s) => get(`/video/${c.video.id}`, s),
    dona: async (res) => expect(await res.text()).toContain(FALA),
    outra: async (res) => expect(res.status).toBe(404),
  },
  ...["mp4", "original.mp4", "editado.mp4", "mp4?baixar"].map((file) => ({
    nome: `arquivo .${file}`,
    pedir: (c: Cena, s?: string) => get(`/videos/${c.video.id}.${file}`, s),
    dona: async (res: Response) => expect(res.status).toBe(200),
    outra: async (res: Response) => expect(res.status).toBe(404),
  })),
  {
    nome: "foto usada para gerar",
    pedir: (c, s) => get(`/videos/${c.video.id}/referencia/imagem`, s),
    dona: async (res) => expect(res.status).toBe(200),
    outra: async (res) => expect(res.status).toBe(404),
  },
  {
    // O Wan não tem edição rápida: a dona recebe o aviso (400); a outra conta, nem isso.
    nome: "rosto",
    pedir: (c, s) => get(`/videos/${c.video.id}/rosto`, s),
    dona: async (res) => expect(res.status).toBe(400),
    outra: async (res) => expect(res.status).toBe(404),
  },
  {
    nome: "edição rápida",
    pedir: (c, s) => call(postForm(`/videos/${c.video.id}/edicao-rapida`, {}, s ? { cookie: s } : {})),
    dona: async (res) => expect(res.status).toBe(400),
    outra: async (res, c) => {
      expect(res.status).toBe(404);
      expect(await db().videoById(c.video.id)).toMatchObject({ edit_status: null });
    },
  },
  {
    // Cada uma tenta salvar num avatar dela.
    nome: "Salvar no avatar",
    pedir: async (c, s) => call(postForm(`/videos/${c.video.id}/salvar-avatar`, { avatar: await avatarDe(s === c.outra.session ? c.outra.id : c.dona.id) }, s ? { cookie: s } : {})),
    dona: async (res) => expect(res.status).toBe(303),
    outra: async (res, c) => {
      expect(res.status).toBe(404);
      expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM avatar_assets WHERE source_video = ?").bind(c.video.id).first<{ n: number }>())!.n).toBe(0);
    },
  },
  {
    nome: "Novo avatar com o vídeo",
    pedir: (c, s) => get(`/avatares/novo?video=${c.video.id}`, s),
    dona: async (res, c) => expect(await res.text()).toContain(c.video.id),
    outra: async (res, c) => expect(await res.text()).not.toContain(c.video.id),
  },
  {
    nome: "Refazer",
    pedir: (c, s) => get(`/modelo/wan?refazer=${c.video.id}`, s),
    dona: async (res) => expect(await res.text()).toContain(FALA),
    outra: async (res, c) => {
      const page = await res.text();
      expect(page).not.toContain(FALA);
      expect(page).not.toContain(c.video.id);
    },
  },
  {
    nome: "Adicionar ativo (Mostrar mais)",
    pedir: (_c, s) => get("/gerados?tipo=video", s),
    dona: async (res, c) => expect(await res.text()).toContain(c.video.id),
    outra: async (res, c) => expect(await res.text()).not.toContain(c.video.id),
  },
];

describe.each(CAMINHOS)("$nome", (caminho) => {
  it("a dona usa", async () => {
    const c = await cena();
    await caminho.dona(await caminho.pedir(c, c.dona.session), c);
  });

  it("outra conta: o vídeo não existe", async () => {
    const c = await cena();
    await caminho.outra(await caminho.pedir(c, c.outra.session), c);
  });

  it("sem login, vai para /entrar", async () => {
    const c = await cena();
    const res = await caminho.pedir(c);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar");
  });

  it("com a sessão vencida, vai para /entrar", async () => {
    const c = await cena();
    const vencida = await conta("dona@exemplo.com", true);
    const res = await caminho.pedir(c, vencida.session);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar");
  });
});

describe("id de outra conta", () => {
  it("responde igual a um id que não existe", async () => {
    const c = await cena();
    const nenhum = crypto.randomUUID();
    for (const path of ["/video/", "/videos/"]) {
      const suffix = path === "/videos/" ? ".mp4" : "";
      const alheio = await get(`${path}${c.video.id}${suffix}`, c.outra.session);
      const inexistente = await get(`${path}${nenhum}${suffix}`, c.outra.session);
      expect(alheio.status).toBe(inexistente.status);
      expect(await alheio.text()).toBe(await inexistente.text());
    }
  });
});

describe("dono vem da sessão", () => {
  it("o formulário não escolhe o dono do vídeo", async () => {
    await cookie();
    const dona = await conta("dona@exemplo.com");
    const outra = await conta("outra@exemplo.com");
    const video = await pronto(dona.session, { user_id: String(outra.id), dono: String(outra.id) });
    expect(video.user_id).toBe(dona.id);
  });
});

describe("o administrador e o vídeo de outra conta", () => {
  it("abre pelo painel só para ver: sem Refazer, Salvar no avatar nem Edição rápida", async () => {
    const admin = await cookie();
    const { video } = await cena();
    const res = await get(`/video/${video.id}`, admin);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain(FALA);
    expect(page).not.toContain("?refazer=");
    expect(page).not.toContain("salvar-avatar");
    expect(page).not.toContain("edicao-rapida");
    expect((await get(`/videos/${video.id}.mp4`, admin)).status).toBe(200);
  });

  it("não vê nas listas dele, nem no Adicionar ativo", async () => {
    const admin = await cookie();
    const { video } = await cena();
    for (const path of ["/videos", "/modelo/wan", "/gerados?tipo=video"]) expect(await (await get(path, admin)).text()).not.toContain(video.id);
  });

  it("não age nele: edição rápida, rosto, Refazer e Salvar no avatar", async () => {
    const admin = await cookie();
    const { video } = await cena();
    const adminId = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!.id;
    expect((await call(postForm(`/videos/${video.id}/edicao-rapida`, {}, { cookie: admin }))).status).toBe(404);
    expect((await get(`/videos/${video.id}/rosto`, admin)).status).toBe(404);
    expect(await (await get(`/modelo/wan?refazer=${video.id}`, admin)).text()).not.toContain(FALA);
    expect((await call(postForm(`/videos/${video.id}/salvar-avatar`, { avatar: await avatarDe(adminId) }, { cookie: admin }))).status).toBe(404);
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
    const { dona, outra, video } = await cena();
    const alheia = db().conta(outra.id);
    expect(await alheia.video(video.id)).toBeNull();
    expect(await alheia.videos(["wan"])).toMatchObject({ items: [], total: 0 });
    expect(await alheia.ready(["wan"])).toHaveLength(0);
    expect((await alheia.countByStructure()).size).toBe(0);
    expect(await alheia.lastExtraByAvatar(["wan"])).toEqual(new Map());
    expect(await alheia.readyVideos(["wan"], { limite: 10 })).toHaveLength(0);
    await env.DB.prepare("UPDATE videos SET avatar_id = 'avatar-da-dona' WHERE id = ?").bind(video.id).run();
    expect((await alheia.videoAvatars([video.id])).size).toBe(0);
    const propria = db().conta(dona.id);
    expect(await propria.video(video.id)).not.toBeNull();
    expect(await propria.videos(["wan"])).toMatchObject({ total: 1, page: 1, items: [{ id: video.id }] });
    expect(await propria.ready(["wan"])).toHaveLength(1);
    expect((await propria.countByStructure()).get("wan")).toBe(1);
    expect(await propria.readyVideos(["wan"], { limite: 10, q: "ninguém mais" })).toHaveLength(1);
    expect((await propria.videoAvatars([video.id])).get(video.id)).toBe("avatar-da-dona");
  });
});

describe("o banco garante o dono (migrations/0018_dono.sql)", () => {
  const novo = (id: string, userId: number | null) =>
    env.DB.prepare("INSERT INTO videos (id, user_id, status, prompt, model, duration, resolution, aspect_ratio, structure, created_at, updated_at) VALUES (?, ?, 'completed', 'Oi', 'm', 5, '480p', '9:16', 'wan', ?, ?)")
      .bind(id, userId, new Date().toISOString(), new Date().toISOString())
      .run();
  const ligar = (avatar: string, video: string) =>
    env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, source_video, created_at) VALUES (?, ?, 'video', 'k', 'v', 'video/mp4', 1, ?, ?)")
      .bind(crypto.randomUUID(), avatar, video, new Date().toISOString())
      .run();

  it("vídeo sem dono não entra", async () => {
    await expect(novo(crypto.randomUUID(), null)).rejects.toThrow("video sem dono");
  });

  it("o dono de um vídeo não vira vazio", async () => {
    const { video } = await cena();
    await expect(env.DB.prepare("UPDATE videos SET user_id = NULL WHERE id = ?").bind(video.id).run()).rejects.toThrow("video sem dono");
    await expect(db().updateVideo(video.id, { status: "failed" })).resolves.toMatchObject({ user_id: video.user_id });
  });

  it("o ativo do avatar só liga a um vídeo da mesma conta", async () => {
    const { dona, outra, video } = await cena();
    const daOutra = await avatarDe(outra.id);
    await expect(ligar(daOutra, video.id)).rejects.toThrow("video de outra conta");
    const daDona = await avatarDe(dona.id);
    await ligar(daDona, video.id);
    // Nem mudando o ativo de avatar depois.
    await expect(env.DB.prepare("UPDATE avatar_assets SET avatar_id = ? WHERE source_video = ?").bind(daOutra, video.id).run()).rejects.toThrow("video de outra conta");
  });

  it("o ativo enviado (sem vídeo) não depende de dono de vídeo", async () => {
    const { dona } = await cena();
    const avatar = await avatarDe(dona.id);
    await env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, source_video, created_at) VALUES (?, ?, 'imagem', 'k', 'f', 'image/png', 1, NULL, ?)")
      .bind(crypto.randomUUID(), avatar, new Date().toISOString())
      .run();
    expect(await db().assetsByAvatar(avatar)).toHaveLength(1);
  });

  it("as listas da conta usam o índice do dono", async () => {
    const plan = await env.DB.prepare("EXPLAIN QUERY PLAN SELECT * FROM videos WHERE user_id = ?1 AND structure IN ('wan') ORDER BY created_at DESC LIMIT 10").bind(1).all<{ detail: string }>();
    expect(plan.results.map((r) => r.detail).join(" ")).toContain("videos_by_user");
  });
});
