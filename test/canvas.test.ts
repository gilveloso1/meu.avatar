import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ERROS } from "../src/erros";
import { call, cookie, FakeVideoApi, memberCookie, SITE } from "./helpers";

const get = async (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session === undefined ? {} : { cookie: session } }), new FakeVideoApi());

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

describe("canvas de edição", () => {
  it("o administrador abre o canvas com os vídeos prontos e as frases de erro do catálogo", async () => {
    await videos();
    const res = await get("/canvas", await cookie());
    expect(res.status).toBe(200);
    const page = await res.text();
    const config = JSON.parse(/<script type="application\/json" id="canvas-config">([\s\S]*?)<\/script>/.exec(page)![1]!);
    expect(config.videos).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", name: "Oi, gente! Hoje eu vou mostrar", src: "/videos/11111111-1111-4111-8111-111111111111.mp4", when: expect.any(String) },
    ]);
    expect(config.erros).toEqual({ arquivo: ERROS.canvasArquivo, video: ERROS.canvasVideo });
    expect(page).toContain('id="vp"');
    expect(res.headers.get("content-security-policy")).toContain("img-src 'self' blob: data:");
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'self' blob:");
  });

  it("a tela inicial mostra o card do canvas só para o administrador", async () => {
    expect(await (await get("/", await cookie())).text()).toContain('href="/canvas"');
    expect(await (await get("/", await memberCookie())).text()).not.toContain('href="/canvas"');
  });

  it("quem não é administrador não vê o canvas", async () => {
    expect((await get("/canvas", await memberCookie())).status).toBe(404);
  });

  it("sem login, vai para a entrada", async () => {
    const res = await get("/canvas");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar");
  });

  it("as outras páginas continuam sem data: nas imagens", async () => {
    expect((await get("/", await cookie())).headers.get("content-security-policy")).toContain("img-src 'self' blob:;");
  });
});
