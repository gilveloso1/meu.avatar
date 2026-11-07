import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { call, cookie, memberCookie, postForm, SITE } from "./helpers";

// Renomear um vídeo (ou imagem) gerado: só quem gerou; o nome aparece nas listas e no
// download, e vazio volta a mostrar a fala.

const get = (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }));
const nome = (id: string) => env.DB.prepare("SELECT name FROM videos WHERE id = ?").bind(id).first<string | null>("name");

async function video(email: string): Promise<string> {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE email = ?), ?, 'completed', 'Oi, gente, hoje vou mostrar meu produto', 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)",
  )
    .bind(email, id, `videos/${id}.mp4`, now, now)
    .run();
  await env.MIDIA.put(`videos/${id}.mp4`, new Uint8Array([0, 0, 0, 8]));
  return id;
}

describe("renomear vídeo", () => {
  it("a folha tem o campo Nome; salvar guarda o nome e volta para o mesmo lugar", async () => {
    const session = await cookie();
    const id = await video("gil@exemplo.com");
    const page = await (await get(`/video/${id}?de=/videos`, session)).text();
    expect(page).toContain(`action="/videos/${id}/nome"`);
    expect(page).toContain('name="nome" type="text" value=""');

    const res = await call(postForm(`/videos/${id}/nome`, { nome: "  Gancho   do produto ", de: "/videos" }, { cookie: session }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/video/${id}?de=%2Fvideos`);
    expect(await nome(id)).toBe("Gancho do produto");

    // O nome aparece na lista, no título da página, na busca e no arquivo baixado.
    expect(await (await get("/videos", session)).text()).toContain("Gancho do produto");
    expect(await (await get(`/video/${id}`, session)).text()).toContain("<title>Gancho do produto · ");
    expect(await (await get("/videos?q=gancho", session)).text()).toContain(`/video/${id}?`);
    const file = await get(`/videos/${id}.mp4?baixar`, session);
    expect(file.headers.get("content-disposition")).toContain("gancho-do-produto.mp4");
  });

  it("salvo pelo script da página, responde 204 sem recarregar", async () => {
    const session = await cookie();
    const id = await video("gil@exemplo.com");
    const res = await call(postForm(`/videos/${id}/nome`, { nome: "Depoimento" }, { cookie: session, "x-fetch": "1" }));
    expect(res.status).toBe(204);
    expect(await nome(id)).toBe("Depoimento");
  });

  it("o vídeo de outra conta, aberto pelo administrador, mostra o nome sem deixar mudar", async () => {
    const admin = await cookie();
    await memberCookie();
    const id = await video("membro@exemplo.com");
    await env.DB.prepare("UPDATE videos SET name = 'Dela' WHERE id = ?").bind(id).run();
    const page = await (await get(`/video/${id}`, admin)).text();
    expect(page).toContain("Dela");
    expect(page).not.toContain(`action="/videos/${id}/nome"`);
  });

  it("nome vazio tira o nome, e a lista volta a mostrar a fala", async () => {
    const session = await cookie();
    const id = await video("gil@exemplo.com");
    await call(postForm(`/videos/${id}/nome`, { nome: "Teste" }, { cookie: session }));
    const res = await call(postForm(`/videos/${id}/nome`, { nome: "   " }, { cookie: session }));
    expect(res.headers.get("location")).toBe(`/video/${id}`);
    expect(await nome(id)).toBeNull();
  });

  it("o nome longo é cortado", async () => {
    const session = await cookie();
    const id = await video("gil@exemplo.com");
    await call(postForm(`/videos/${id}/nome`, { nome: "a".repeat(300) }, { cookie: session }));
    expect((await nome(id))!.length).toBe(120);
  });

  it("o vídeo de outra conta não se renomeia (404) e o nome dele fica como estava", async () => {
    await cookie();
    const id = await video("gil@exemplo.com");
    const res = await call(postForm(`/videos/${id}/nome`, { nome: "Invasão" }, { cookie: await memberCookie() }));
    expect(res.status).toBe(404);
    expect(await nome(id)).toBeNull();
  });

  it("sem sessão não renomeia", async () => {
    await cookie();
    const id = await video("gil@exemplo.com");
    await call(postForm(`/videos/${id}/nome`, { nome: "Invasão" }));
    expect(await nome(id)).toBeNull();
  });
});
