import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ERROS } from "../src/erros";
import { MAX_IMAGE_BYTES } from "../src/studio";
import { call, cookie, FakeVideoApi, memberCookie, SITE } from "./helpers";

const get = async (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session === undefined ? {} : { cookie: session } }), new FakeVideoApi());
const post = (path: string, session: string, body: BodyInit | null = null, headers: Record<string, string> = {}) =>
  call(new Request(`${SITE}${path}`, { method: "POST", body, headers: { origin: SITE, cookie: session, ...headers } }), new FakeVideoApi());

/** Um vídeo pronto (e um que ainda está na fila) direto no banco. */
async function videos() {
  const now = new Date().toISOString();
  const insert = (id: string, status: string, key: string | null) =>
    env.DB.prepare(
      "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES (?, ?, ?, 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)",
    )
      .bind(id, status, "Oi, gente! Hoje eu vou mostrar meu produto favorito.", key, now, now)
      .run();
  await insert("11111111-1111-4111-8111-111111111111", "completed", "videos/11111111-1111-4111-8111-111111111111.mp4");
  await insert("22222222-2222-4222-8222-222222222222", "pending", null);
}

/** Cria um projeto pelo site e devolve o id. */
async function novo(session: string): Promise<string> {
  const res = await post("/projetos", session);
  expect(res.status).toBe(303);
  return /^\/canvas\/([0-9a-f-]{36})$/.exec(res.headers.get("location")!)![1]!;
}

const config = (page: string) => JSON.parse(/<script type="application\/json" id="canvas-config">([\s\S]*?)<\/script>/.exec(page)![1]!);

describe("projetos do canvas", () => {
  it("Novo projeto abre o canvas com os vídeos prontos, o projeto e as frases do catálogo", async () => {
    const admin = await cookie();
    await videos();
    const id = await novo(admin);
    const res = await get(`/canvas/${id}`, admin);
    expect(res.status).toBe(200);
    const c = config(await res.text());
    expect(c.videos).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", name: "Oi, gente! Hoje eu vou mostrar", src: "/videos/11111111-1111-4111-8111-111111111111.mp4", when: expect.any(String) },
    ]);
    expect(c.projeto).toMatchObject({ id, name: "Projeto sem nome", data: { blocks: [], edges: [] }, salvar: `/projetos/${id}/salvar`, arquivos: `/projetos/${id}/arquivos` });
    expect(c.erros).toMatchObject({ arquivo: ERROS.canvasArquivo, salvar: ERROS.canvasSalvar, nome: ERROS.projetoNome });
    expect(res.headers.get("content-security-policy")).toContain("img-src 'self' blob: data:");
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'self' blob:");
  });

  it("salva o canvas e o nome, e a lista mostra o projeto", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const data = { blocks: [{ id: "b1", kind: "video", name: "Gancho", src: "/videos/x.mp4" }], finals: [{ id: "final", x: 0, y: 0, size: "1080x1920" }], edges: [] };
    expect((await post(`/projetos/${id}/salvar`, admin, JSON.stringify({ name: "Campanha de verão", data }))).status).toBe(204);
    const c = config(await (await get(`/canvas/${id}`, admin)).text());
    expect(c.projeto).toMatchObject({ name: "Campanha de verão", data });
    const lista = await (await get("/projetos", admin)).text();
    expect(lista).toContain("Campanha de verão");
    expect(lista).toContain("1 bloco");
    expect(await (await get("/projetos?q=inverno", admin)).text()).not.toContain("Campanha de verão");
  });

  it("recusa canvas inválido, nome vazio e salvamento grande demais", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    expect((await post(`/projetos/${id}/salvar`, admin, "{")).status).toBe(400);
    expect((await post(`/projetos/${id}/salvar`, admin, JSON.stringify({ data: { blocks: [] } }))).status).toBe(400);
    const vazio = await post(`/projetos/${id}/salvar`, admin, JSON.stringify({ name: "  " }));
    expect([vazio.status, await vazio.text()]).toEqual([400, ERROS.projetoNome]);
    expect((await post(`/projetos/${id}/salvar`, admin, JSON.stringify({ data: { blocks: ["x".repeat(1024 * 1024)], finals: [], edges: [] } }))).status).toBe(413);
  });

  it("guarda o arquivo enviado no R2, serve de volta e recusa tipo e tamanho errados", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const res = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array([1, 2, 3, 4]), { "content-type": "video/mp4", "x-nome": encodeURIComponent("meu vídeo.mp4") });
    expect(res.status).toBe(201);
    const { src } = (await res.json()) as { src: string };
    expect(src).toMatch(new RegExp(`^/projetos/${id}/arquivos/[0-9a-f-]{36}$`));
    const file = await get(src, admin);
    expect([file.status, file.headers.get("content-type"), [...new Uint8Array(await file.arrayBuffer())]]).toEqual([200, "video/mp4", [1, 2, 3, 4]]);
    const tipo = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array([1]), { "content-type": "application/pdf" });
    expect([tipo.status, await tipo.text()]).toEqual([400, ERROS.canvasArquivo]);
    const grande = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array(MAX_IMAGE_BYTES + 1), { "content-type": "image/png" });
    expect([grande.status, await grande.text()]).toEqual([413, ERROS.canvasArquivoGrande(MAX_IMAGE_BYTES / 1024 / 1024)]);
  });

  it("apagar pede confirmação e leva o projeto e os arquivos dele", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const { src } = (await (await post(`/projetos/${id}/arquivos`, admin, new Uint8Array([9]), { "content-type": "image/png" })).json()) as { src: string };
    const key = `projetos/${id}/${src.split("/").pop()}`;
    expect(await env.MIDIA.head(key)).not.toBeNull();
    expect(await (await get(`/projetos/${id}/apagar`, admin)).text()).toContain("Apagar “Projeto sem nome”?");
    expect((await post(`/projetos/${id}/apagar`, admin)).headers.get("location")).toBe("/projetos");
    expect((await get(`/canvas/${id}`, admin)).status).toBe(404);
    expect(await env.MIDIA.head(key)).toBeNull();
  });

  it("projeto de outra pessoa não abre, não salva, não recebe arquivo e não apaga", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const outro = await env.DB.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES ('outro@exemplo.com', 'Outro', 'member', NULL, ?) RETURNING id")
      .bind(new Date().toISOString())
      .first<{ id: number }>();
    await env.DB.prepare("UPDATE projects SET user_id = ? WHERE id = ?").bind(outro!.id, id).run();
    expect((await get(`/canvas/${id}`, admin)).status).toBe(404);
    expect((await post(`/projetos/${id}/salvar`, admin, JSON.stringify({ name: "Meu" }))).status).toBe(404);
    expect((await post(`/projetos/${id}/arquivos`, admin, new Uint8Array([1]), { "content-type": "image/png" })).status).toBe(404);
    expect((await post(`/projetos/${id}/apagar`, admin)).status).toBe(404);
    expect(await env.DB.prepare("SELECT name FROM projects WHERE id = ?").bind(id).first("name")).toBe("Projeto sem nome");
    expect(await (await get("/projetos", admin)).text()).not.toContain(`/canvas/${id}`);
  });

  it("salvar de outro site é recusado", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const res = await call(new Request(`${SITE}/projetos/${id}/salvar`, { method: "POST", body: JSON.stringify({ name: "X" }), headers: { origin: "https://outro.site", cookie: admin } }), new FakeVideoApi());
    expect(res.status).toBe(403);
  });

  it("a aba Projetos aparece só para o administrador", async () => {
    expect(await (await get("/", await cookie())).text()).toContain('href="/projetos"');
    expect(await (await get("/", await memberCookie())).text()).not.toContain('href="/projetos"');
  });

  it("quem não é administrador não vê os projetos nem o canvas", async () => {
    const member = await memberCookie();
    expect((await get("/projetos", member)).status).toBe(404);
    expect((await post("/projetos", member)).status).toBe(404);
    expect((await get("/canvas", member)).status).toBe(404);
  });

  it("sem login, vai para a entrada; /canvas sozinho leva aos projetos", async () => {
    const res = await get("/projetos");
    expect([res.status, res.headers.get("location")]).toEqual([303, "/entrar"]);
    expect((await get("/canvas", await cookie())).headers.get("location")).toBe("/projetos");
  });

  it("as outras páginas continuam sem data: nas imagens", async () => {
    expect((await get("/", await cookie())).headers.get("content-security-policy")).toContain("img-src 'self' blob:;");
  });
});
