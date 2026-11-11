import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ERROS } from "../src/erros";
import { MAX_IMAGE_BYTES } from "../src/studio";
import { Db } from "../src/db";
import { Exports } from "../src/exportar";
import { call, cookie, FakeExportApi, FakeVideoApi, memberCookie, mp4Bytes, SITE, webmBytes } from "./helpers";

const get = async (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session === undefined ? {} : { cookie: session } }), new FakeVideoApi());
const post = (path: string, session: string, body: BodyInit | null = null, headers: Record<string, string> = {}) =>
  call(new Request(`${SITE}${path}`, { method: "POST", body, headers: { origin: SITE, cookie: session, ...headers } }), new FakeVideoApi());

/** Um vídeo pronto (e um que ainda está na fila) direto no banco. */
async function videos() {
  const now = new Date().toISOString();
  const insert = (id: string, status: string, key: string | null) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, ?, ?, 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)",
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
  it("Novo projeto abre o canvas com o projeto e as frases do catálogo; os arquivos vêm depois, pelo painel Arquivos", async () => {
    const admin = await cookie();
    await videos();
    const id = await novo(admin);
    const res = await get(`/canvas/${id}`, admin);
    expect(res.status).toBe(200);
    const page = await res.text();
    const c = config(page);
    // A página não carrega mais a lista de vídeos: o painel Arquivos pede uma página por vez.
    expect(c.videos).toBeUndefined();
    // O painel vem fechado, à esquerda do canvas, e o botão da barra o abre.
    expect(page).toMatch(/<aside class="files-panel" id="lib"[^>]* hidden>/);
    expect(page).toContain('data-open-library aria-controls="lib" aria-expanded="false"');
    // O envio do computador saiu da barra de cima: fica no pé do painel (e no canvas vazio).
    expect(/<header[\s\S]*?<\/header>/.exec(page)?.[0] ?? "").not.toContain("data-open-file");
    expect(page).toMatch(/id="lib-foot">\s*<button[^>]*data-open-file>/);
    expect(c.projeto).toMatchObject({ id, name: "Projeto sem nome", data: { blocks: [], edges: [] }, salvar: `/projetos/${id}/salvar`, arquivos: `/projetos/${id}/arquivos`, acervo: `/projetos/${id}/acervo` });
    expect(c.erros).toMatchObject({ arquivo: ERROS.canvasArquivo, salvar: ERROS.canvasSalvar, nome: ERROS.projetoNome, abrir: ERROS.canvasAbrir, acervo: ERROS.canvasAcervo });
    expect(res.headers.get("content-security-policy")).toContain("img-src 'self' blob: data:");
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com blob:");
  });

  describe("Arquivos (o painel do canvas)", () => {
    const V1 = "11111111-1111-4111-8111-111111111111";
    type Arquivo = { id: string; nome: string; tipo: string; src: string; quando: string; de?: string };
    type Lista = { pastas?: { id: string; nome: string; itens: number }[]; avatares?: { id: string; nome: string; foto: string | null; itens: number }[]; arquivos: Arquivo[]; continuar?: string };
    const acervo = async (id: string, session: string, query = "") => (await (await get(`/projetos/${id}/acervo${query}`, session)).json()) as Lista;
    const dono = async () => (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!.id;
    const agora = () => new Date().toISOString();
    /** Um gerado pronto direto no banco: vídeo (wan), imagem (nano-banana) ou áudio (fish). */
    const gerado = async (structure: string, ext: string, prompt: string, when = agora(), folder: string | null = null) => {
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, folder_id, created_at, updated_at) VALUES (?, ?, 'completed', ?, 'm', 5, '480p', '9:16', ?, ?, ?, ?, ?)")
        .bind(await dono(), id, prompt, `videos/${id}.${ext}`, structure, folder, when, when)
        .run();
      return id;
    };

    it("Gerados: vídeo, imagem e áudio, com as pastas antes; a raiz só mostra o que está fora de pasta", async () => {
      const admin = await cookie();
      await videos();
      const id = await novo(admin);
      const pasta = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO account_folders (id, user_id, kind, name, created_at) VALUES (?, ?, 'videos', 'Ganchos', ?)").bind(pasta, await dono(), agora()).run();
      const naPasta = await gerado("wan", "mp4", "Você não vai acreditar", "2026-01-02T00:00:00.000Z", pasta);
      const imagem = await gerado("nano-banana", "png", "Uma praia ao pôr do sol", "2026-01-03T00:00:00.000Z");
      const audio = await gerado("fish", "mp3", "[excited] Bom dia, pessoal", "2026-01-04T00:00:00.000Z");

      const raiz = await acervo(id, admin);
      expect(raiz.pastas).toEqual([{ id: pasta, nome: "Ganchos", itens: 1 }]);
      expect(raiz.arquivos.map((a) => a.id)).toEqual([V1, audio, imagem]);
      expect(raiz.arquivos.find((a) => a.id === V1)).toMatchObject({ nome: "Oi, gente! Hoje eu vou mostrar", tipo: "video", src: `/videos/${V1}.mp4` });
      // O nome do áudio não leva a marcação da emoção; a imagem e o áudio saem com o endereço do tipo deles.
      expect(raiz.arquivos.find((a) => a.id === audio)).toMatchObject({ nome: "Bom dia, pessoal", tipo: "audio", src: `/videos/${audio}.mp3` });
      expect(raiz.arquivos.find((a) => a.id === imagem)).toMatchObject({ tipo: "imagem", src: `/videos/${imagem}.png` });
      // O que ainda está na fila não entra.
      expect(raiz.arquivos.some((a) => a.id === "22222222-2222-4222-8222-222222222222")).toBe(false);

      expect((await acervo(id, admin, `?pasta=${pasta}`)).arquivos.map((a) => a.id)).toEqual([naPasta]);
      // O tipo filtra (e as pastas somem); a busca procura em tudo, também dentro das pastas.
      const audios = await acervo(id, admin, "?tipo=audio");
      expect(audios.arquivos.map((a) => a.id)).toEqual([audio]);
      expect(audios.pastas).toEqual([]);
      expect((await acervo(id, admin, "?q=acreditar")).arquivos.map((a) => a.id)).toEqual([naPasta]);
      expect((await get(`/projetos/${id}/acervo?tipo=musica`, admin)).status).toBe(400);
    });

    it("vem em páginas, com o continuar", async () => {
      const admin = await cookie();
      const id = await novo(admin);
      const { LIBRARY_PAGE } = await import("../src/site/site");
      for (let i = 0; i < LIBRARY_PAGE + 3; i++) await gerado("wan", "mp4", `Vídeo ${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString());
      const um = await acervo(id, admin);
      expect(um.arquivos).toHaveLength(LIBRARY_PAGE);
      expect(um.arquivos[0]!.nome).toBe(`Vídeo ${LIBRARY_PAGE + 2}`);
      const dois = await acervo(id, admin, `?continuar=${encodeURIComponent(um.continuar!)}`);
      expect(dois.arquivos.map((a) => a.nome)).toEqual(["Vídeo 2", "Vídeo 1", "Vídeo 0"]);
      expect(dois.continuar).toBeUndefined();
    });

    it("Avatares: primeiro o avatar, depois as pastas e os ativos dele; Deste projeto: só os arquivos deste", async () => {
      const admin = await cookie();
      const id = await novo(admin);
      const outro = await novo(admin);
      const [avatar, vazio, pasta, foto, voz] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      const user = await dono();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO avatars (id, user_id, name, description, photo_asset, created_at, updated_at) VALUES (?, ?, 'Camila', '', ?, ?, ?)").bind(avatar, user, foto, agora(), agora()),
        env.DB.prepare("INSERT INTO avatars (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, 'Sem ativos', '', ?, ?)").bind(vazio, user, agora(), agora()),
        env.DB.prepare("INSERT INTO folders (id, avatar_id, name, created_at) VALUES (?, ?, 'Fotos', ?)").bind(pasta, avatar, agora()),
        env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, folder_id, created_at) VALUES (?, ?, 'imagem', 'k1', 'Rosto.png', 'image/png', 3, ?, ?)").bind(foto, avatar, pasta, agora()),
        env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, created_at) VALUES (?, ?, 'audio', 'k2', 'Voz.mp3', 'audio/mpeg', 3, ?)").bind(voz, avatar, agora()),
      ]);
      // Sem avatar escolhido: a lista dos avatares que têm arquivos, com a foto.
      const lista = await acervo(id, admin, "?fonte=avatar");
      expect(lista).toEqual({ avatares: [{ id: avatar, nome: "Camila", foto: `/avatares/${avatar}/arquivos/${foto}`, itens: 2 }], arquivos: [] });
      const dele = await acervo(id, admin, `?fonte=avatar&avatar=${avatar}`);
      expect(dele.pastas).toEqual([{ id: pasta, nome: "Fotos", itens: 1 }]);
      expect(dele.arquivos).toEqual([expect.objectContaining({ id: voz, nome: "Voz.mp3", tipo: "audio", src: `/avatares/${avatar}/arquivos/${voz}` })]);
      expect((await acervo(id, admin, `?fonte=avatar&avatar=${avatar}&pasta=${pasta}`)).arquivos.map((a) => a.id)).toEqual([foto]);
      // A busca sem avatar procura nos ativos de todos e diz de quem é.
      expect((await acervo(id, admin, "?fonte=avatar&q=rosto")).arquivos).toEqual([expect.objectContaining({ id: foto, de: "Camila" })]);

      // Deste projeto: o que foi enviado a ele, mesmo sem bloco; o de outro projeto não entra.
      const envia = (projeto: string, nome: string) => post(`/projetos/${projeto}/arquivos`, admin, webmBytes(false), { "content-type": "video/webm", "x-nome": nome });
      const meu = ((await (await envia(id, "camada.webm")).json()) as { src: string }).src;
      await envia(outro, "de-outro.webm");
      expect((await acervo(id, admin, "?fonte=projeto")).arquivos).toEqual([expect.objectContaining({ nome: "camada.webm", tipo: "video", src: meu })]);
      expect((await get(`/projetos/${id}/acervo?fonte=lixo`, admin)).status).toBe(400);
    });

    it("de outra conta nada aparece: nem os gerados, nem o avatar, nem a pasta; sem o canvas, a rota não existe", async () => {
      const admin = await cookie();
      const id = await novo(admin);
      const membro = await memberCookie();
      const dela = (await env.DB.prepare("SELECT id FROM users WHERE email = 'membro@exemplo.com'").first<{ id: number }>())!.id;
      const [video, avatar, ativo, pasta] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await env.DB.batch([
        env.DB.prepare("INSERT INTO account_folders (id, user_id, kind, name, created_at) VALUES (?, ?, 'videos', 'Dela', ?)").bind(pasta, dela, agora()),
        env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, folder_id, created_at, updated_at) VALUES (?, ?, 'completed', 'Dela', 'm', 5, '480p', '9:16', ?, 'wan', ?, ?, ?)").bind(dela, video, `videos/${video}.mp4`, pasta, agora(), agora()),
        env.DB.prepare("INSERT INTO avatars (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, 'Dela', '', ?, ?)").bind(avatar, dela, agora(), agora()),
        env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, created_at) VALUES (?, ?, 'imagem', 'k', 'Dela.png', 'image/png', 3, ?)").bind(ativo, avatar, agora()),
      ]);
      expect(await acervo(id, admin)).toEqual({ pastas: [], arquivos: [] });
      expect((await acervo(id, admin, `?pasta=${pasta}`)).arquivos).toEqual([]);
      expect((await acervo(id, admin, "?q=Dela")).arquivos).toEqual([]);
      expect((await acervo(id, admin, "?fonte=avatar")).avatares).toEqual([]);
      expect((await get(`/projetos/${id}/acervo?fonte=avatar&avatar=${avatar}`, admin)).status).toBe(404);
      expect((await acervo(id, admin, "?fonte=avatar&q=Dela")).arquivos).toEqual([]);
      // A conta sem o canvas não lê o acervo de projeto nenhum, e sem login também não.
      expect((await get(`/projetos/${id}/acervo`, membro)).status).toBe(404);
      expect((await get(`/projetos/${id}/acervo`)).status).not.toBe(200);
    });
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
    // A tela usa o som da resposta: vídeo sem som entra sem a camada de áudio.
    expect(await (await post(`/projetos/${id}/arquivos`, admin, webmBytes(false), { "content-type": "video/webm" })).json()).toMatchObject({ som: false });
    expect(await (await post(`/projetos/${id}/arquivos`, admin, mp4Bytes(true), { "content-type": "video/mp4" })).json()).toMatchObject({ som: true });
    const tipo = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array([1]), { "content-type": "application/pdf" });
    expect([tipo.status, await tipo.text()]).toEqual([400, ERROS.canvasArquivo]);
    const grande = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array(MAX_IMAGE_BYTES + 1), { "content-type": "image/png" });
    expect([grande.status, await grande.text()]).toEqual([413, ERROS.canvasArquivoGrande(MAX_IMAGE_BYTES / 1024 / 1024)]);
  });

  it("recusa SVG e HTML (podem levar script) e serve o arquivo sem adivinhar o tipo e sem script", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const type of ["image/svg+xml", "text/html", "image/gif", "application/xml"]) {
      const res = await post(`/projetos/${id}/arquivos`, admin, svg, { "content-type": type });
      expect([type, res.status, await res.text()]).toEqual([type, 400, ERROS.canvasArquivo]);
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM project_files WHERE project_id = ?").bind(id).first("n")).toBe(0);
    // Um arquivo guardado antes da lista fechada, aberto direto: nosniff e CSP com sandbox, sem script.
    await env.DB.prepare("INSERT INTO project_files (id, project_id, key, name, type, size, created_at) VALUES ('00000000-0000-4000-8000-0000000000aa', ?, 'projetos/velho.svg', 'velho.svg', 'image/svg+xml', 1, ?)").bind(id, new Date().toISOString()).run();
    await env.MIDIA.put("projetos/velho.svg", svg, { httpMetadata: { contentType: "image/svg+xml" } });
    const velho = await get(`/projetos/${id}/arquivos/00000000-0000-4000-8000-0000000000aa`, admin);
    expect(velho.headers.get("x-content-type-options")).toBe("nosniff");
    expect(velho.headers.get("content-security-policy")).toMatch(/default-src 'none'.*sandbox/);
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
    expect((await get("/", await cookie())).headers.get("content-security-policy")).not.toContain("frame-src");
  });

  it("a animação em código roda numa página à parte, que só o canvas põe num quadro e não fala com a rede", async () => {
    const admin = await cookie();
    const id = await novo(admin);
    const canvas = await get(`/canvas/${id}`, admin);
    expect(canvas.headers.get("content-security-policy")).toContain("frame-src 'self'");
    const src = config(await canvas.text()).animacao as string;
    expect(src).toMatch(/^\/canvas\/animacao\?v=\d+$/);
    const res = await get(src, admin);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("connect-src");
    expect(res.headers.get("x-frame-options")).toBeNull();
    const page = await res.text();
    expect(page).toContain("GSAP 3.15.0");
    expect(page).not.toContain("/*GSAP*/");
    // Como o canvas: só o administrador.
    expect((await get(src, await memberCookie())).status).toBe(404);
  });
});

describe("exportar projetos", () => {
  // O R2 dos testes não zera sozinho, e trecho igual é reaproveitado.
  beforeEach(async () => {
    for (const prefix of ["trechos/", "exportacoes/"]) {
      const { objects } = await env.MIDIA.list({ prefix });
      if (objects.length) await env.MIDIA.delete(objects.map((o) => o.key));
    }
  });

  const VIDEO = "11111111-1111-4111-8111-111111111111";
  const bloco = (id: string, src: string, x: number, y: number, tin = 0) => ({ id, kind: "video", name: id, src, dur: 4, tin, tout: 4, x, y, mute: false, vol: 1, tone: 1, audio: "linked" });
  /** Dois ganchos ligados a um corpo: 2 versões de 3 trechos. */
  const dados = (src = `/videos/${VIDEO}.mp4`) => ({
    blocks: [bloco("g1", src, 0, 0), bloco("g2", src, 0, 300, 1), bloco("corpo", src, 400, 0, 2)],
    finals: [{ id: "final", x: 900, y: 0, resolution: "720p", format: "9:16" }],
    edges: [
      { id: "e1", from: "g1", to: "corpo" },
      { id: "e2", from: "g2", to: "corpo" },
      { id: "e3", from: "corpo", to: "final" },
    ],
  });
  const com = (exporter: FakeExportApi, path: string, session: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
    call(new Request(`${SITE}${path}`, { method, body: body === undefined ? null : JSON.stringify(body), headers: { origin: SITE, cookie: session } }), new FakeVideoApi(), null, null, exporter);
  async function projeto(session: string, data: unknown = dados()) {
    await videos();
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array(1000));
    const id = await novo(session);
    expect((await post(`/projetos/${id}/salvar`, session, JSON.stringify({ data }))).status).toBe(204);
    return id;
  }
  type Estado = { id: string; status: string; feitos: number; total: number; versoes: { nome: string; href: string; arquivo: string; baixar?: string; som: string; arquivoSom: string; baixarSom?: string }[]; zip: string | null; baixarZip?: string; baixarAte?: string; erro: string | null };
  /** Pede e chama os passos, como a tela faz. */
  async function exportar(fake: FakeExportApi, id: string, session: string, body: unknown = { final: "final" }): Promise<Estado> {
    const res = await com(fake, `/projetos/${id}/exportar`, session, body);
    expect(res.status).toBe(201);
    let st = (await res.json()) as Estado;
    for (let i = 0; st.status === "running" && i < 20; i++) st = (await (await com(fake, `/projetos/${id}/exportacoes/${st.id}`, session, {})).json()) as Estado;
    return st;
  }

  it("o canvas leva os dados do projeto para os Ajustes", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const page = await (await com(new FakeExportApi(), `/canvas/${id}`, admin)).text();
    expect(page).toMatch(/"criado":"\d\d\/\d\d[^"]*","modificado":"\d\d\/\d\d[^"]*","autor":"[^"]+"/);
  });

  it("cada grupo é feito uma vez e as versões saem da emenda", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    expect(st.status).toBe("done");
    expect([fake.segments.length, fake.joins.length]).toEqual([3, 2]);
    expect(st.versoes.map((v) => v.nome)).toEqual(["Variação 1", "Variação 2"]);
    expect(JSON.parse(fake.segments[0]!.plan)).toMatchObject({ largura: 720, altura: 1280, duracao: 4, itens: [{ tipo: "video", arquivo: 0, volume: 1 }] });
    expect(fake.segments[0]!.sizes.slice(1)).toEqual([1000]);
    const mp4 = await com(fake, st.versoes[1]!.href, admin);
    expect([mp4.status, await mp4.text(), mp4.headers.get("content-disposition")]).toEqual([200, "mp4ok", `attachment; filename="02 - Variacao 2.mp4"; filename*=UTF-8''${encodeURIComponent("02 - Variação 2.mp4")}`]);
  });

  it("exportar de novo sem mudar nada não chama o contêiner e os arquivos continuam baixando", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    await exportar(new FakeExportApi(), id, admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    expect([st.status, fake.segments.length, fake.joins.length]).toEqual(["done", 0, 0]);
    expect((await (await com(fake, st.versoes[0]!.href, admin)).text())).toBe("mp4ok");
    const zip = await com(fake, st.zip!, admin);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(bytes.byteLength - 22, true)).toBe(0x06054b50);
    const uma = await exportar(fake, id, admin, { final: "final", versoes: [1] });
    expect([uma.versoes.map((v) => v.nome), uma.zip, fake.joins.length]).toEqual([["Variação 2"], null, 0]);
  });

  it("mudar um gancho refaz só ele e a versão dele", async () => {
    const admin = await cookie();
    const data = dados();
    const id = await projeto(admin, data);
    await exportar(new FakeExportApi(), id, admin);
    data.blocks[0]!.tin = 0.5;
    expect((await post(`/projetos/${id}/salvar`, admin, JSON.stringify({ data }))).status).toBe(204);
    const fake = new FakeExportApi();
    expect((await exportar(fake, id, admin)).status).toBe("done");
    expect([fake.segments.length, fake.joins.length]).toEqual([1, 1]);
  });

  it("versão com mais de 24 horas é emendada de novo, sem refazer os trechos", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    await exportar(new FakeExportApi(), id, admin);
    const fake = new FakeExportApi();
    const exports = new Exports(new Db(env.DB), env.MIDIA, fake);
    const depois = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const row = await exports.start((await new Db(env.DB).projectById(id))!, { id: 0, role: "admin", permissoes: [] }, "final", undefined, depois);
    for (let i = 0; i < row.total; i++) await exports.advance(row.id);
    expect([fake.segments.length, fake.joins.length]).toEqual([0, 2]);
  });

  it("a exportação pronta traz um link que baixa sem token nem sessão, só dela e só enquanto não expira", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    expect(st.versoes[0]).toMatchObject({ arquivo: "01 - Variação 1.mp4", baixar: expect.stringMatching(new RegExp(`^${SITE}/baixar/${st.id}/[0-9a-f]{64}/0\\.mp4$`)) });
    expect(st.baixarZip).toBe(st.versoes[0]!.baixar!.replace(/0\.mp4$/, "todas.zip"));
    const sem = (url: string, method = "GET") => call(new Request(url, { method }), new FakeVideoApi(), null, null, fake);
    const res = await sem(st.versoes[0]!.baixar!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("01 - Variação 1.mp4")}`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await sem(st.baixarZip!)).status).toBe(200);
    // Código errado, de outra exportação, versão que não existe ou outro método: nada.
    const outra = await exportar(fake, id, admin, { final: "final", versoes: [1] });
    const codigo = st.versoes[0]!.baixar!.split("/")[5]!;
    for (const url of [st.versoes[0]!.baixar!.replace(codigo, "0".repeat(64)), `${SITE}/baixar/${outra.id}/${codigo}/0.mp4`, st.versoes[0]!.baixar!.replace(/0\.mp4$/, "9.mp4")]) expect([url, (await sem(url)).status]).toEqual([url, 404]);
    expect((await sem(st.versoes[0]!.baixar!, "POST")).status).not.toBe(200);
    // Uma hora depois de entregue, o link vence; perguntar de novo renova, com o mesmo endereço.
    expect(Date.parse(st.baixarAte!) - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    expect(Date.parse(st.baixarAte!) - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
    const vence = async () => {
      const row = (await new Db(env.DB).exportById(st.id))!;
      await env.DB.prepare("UPDATE exports SET plan = ? WHERE id = ?").bind(JSON.stringify({ ...JSON.parse(row.plan), linkAte: new Date(Date.now() - 1000).toISOString() }), st.id).run();
    };
    await vence();
    expect((await sem(st.versoes[0]!.baixar!)).status).toBe(410);
    const de_novo = (await (await com(fake, `/projetos/${id}/exportacoes/${st.id}`, admin)).json()) as Estado;
    expect(de_novo.versoes[0]!.baixar).toBe(st.versoes[0]!.baixar);
    expect((await sem(st.versoes[0]!.baixar!)).status).toBe(200);
    // Expirada a exportação: vence também, e perguntar não renova.
    await env.DB.prepare("UPDATE exports SET expires_at = ? WHERE id = ?").bind(new Date(Date.now() - 1000).toISOString(), st.id).run();
    expect((await sem(st.versoes[0]!.baixar!)).status).toBe(410);
    expect(((await (await com(fake, `/projetos/${id}/exportacoes/${st.id}`, admin)).json()) as Estado).versoes).toEqual([]);
  });

  it("só o som da versão: o MP3 sai no primeiro pedido, fica guardado e baixa pela sessão e pelo link", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    const som = `/projetos/${id}/exportacoes/${st.id}/0.mp3`;
    expect(st.versoes[0]).toMatchObject({ som, arquivoSom: "01 - Variação 1.mp3", baixarSom: st.versoes[0]!.baixar!.replace(/0\.mp4$/, "0.mp3") });
    // A tela prepara antes de baixar: o contêiner tira o som uma vez só.
    expect((await com(fake, som, admin, undefined, "POST")).status).toBe(204);
    const res = await com(fake, som, admin);
    expect([res.status, res.headers.get("content-type"), await res.text()]).toEqual([200, "audio/mpeg", "som-mp3"]);
    expect(res.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("01 - Variação 1.mp3")}`);
    const semToken = await call(new Request(st.versoes[0]!.baixarSom!), new FakeVideoApi(), null, null, fake);
    expect([semToken.status, await semToken.text()]).toEqual([200, "som-mp3"]);
    expect(fake.inspected.filter((i) => i.path === "/som").length).toBe(1);
    // De outra conta, versão que não existe: nada.
    expect((await com(fake, som, await memberCookie())).status).toBe(404);
    expect((await com(fake, som.replace(/0\.mp3$/, "9.mp3"), admin)).status).toBe(404);
    // Contêiner falhando: a frase do catálogo, sem o motivo técnico.
    const outra = await exportar(fake, id, admin, { final: "final", versoes: [1] });
    fake.fail = "ffmpeg quebrou";
    const falha = await com(fake, `/projetos/${id}/exportacoes/${outra.id}/0.mp3`, admin, undefined, "POST");
    expect([falha.status, await falha.text()]).toEqual([502, ERROS.exportarSom]);
    // O vídeo já saiu do R2: não há de onde tirar o som.
    fake.fail = null;
    const plano = JSON.parse((await new Db(env.DB).exportById(outra.id))!.plan) as { versoes: { chave: string }[] };
    await env.MIDIA.delete(plano.versoes[0]!.chave);
    const sumiu = await com(fake, `/projetos/${id}/exportacoes/${outra.id}/0.mp3`, admin, undefined, "POST");
    expect([sumiu.status, await sumiu.text()]).toEqual([410, ERROS.exportarExpirou]);
  });

  it("o ZIP traz as versões com os tamanhos certos", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    const res = await com(fake, st.zip!, admin);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBe(Number(res.headers.get("content-length")));
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const fim = bytes.byteLength - 22;
    expect([view.getUint32(fim, true), view.getUint16(fim + 10, true)]).toEqual([0x06054b50, 2]);
    const central = view.getUint32(fim + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint32(central + 20, true)).toBe(5);
    expect(view.getUint32(central + 16, true)).toBe(123);
    const nome = view.getUint16(central + 28, true);
    expect(new TextDecoder().decode(bytes.slice(central + 46, central + 46 + nome))).toBe("01 - Variação 1.mp4");
    const segundo = view.getUint32(central + 46 + nome + 42, true);
    expect(view.getUint32(segundo, true)).toBe(0x04034b50);
  });

  it("sem caber num ZIP, as versões saem uma a uma", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    const row = await new Db(env.DB).exportById(st.id);
    const plan = JSON.parse(row!.plan) as { versoes: { tamanho: number }[] };
    plan.versoes[0]!.tamanho = 2 ** 32;
    await env.DB.prepare("UPDATE exports SET plan = ? WHERE id = ?").bind(JSON.stringify(plan), st.id).run();
    const agora = (await (await com(fake, `/projetos/${id}/exportacoes/${st.id}`, admin)).json()) as Estado;
    expect([agora.zip, agora.versoes.length]).toEqual([null, 2]);
    expect((await com(fake, st.zip!, admin)).status).toBe(404);
    expect((await com(fake, agora.versoes[0]!.href, admin)).status).toBe(200);
  });

  it("depois de três tentativas, a exportação falha com a frase do catálogo", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    fake.fail = "ffmpeg quebrou";
    const st = await exportar(fake, id, admin);
    expect([st.status, st.erro, st.versoes]).toEqual(["failed", ERROS.exportarFalhou, []]);
    expect(JSON.stringify(st)).not.toContain("ffmpeg");
  });

  it("o agendamento termina o que a tela deixou pela metade", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const { id: eid } = (await (await com(fake, `/projetos/${id}/exportar`, admin, { final: "final" })).json()) as Estado;
    await new Exports(new Db(env.DB), env.MIDIA, fake).next();
    expect(((await (await com(fake, `/projetos/${id}/exportacoes/${eid}`, admin)).json()) as Estado).status).toBe("done");
  });

  it("com quem dá os passos no servidor, começar e acompanhar só o acionam, sem passo no pedido", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const acionados: string[] = [];
    const exports = new Exports(new Db(env.DB), env.MIDIA, fake, null, null, { start: async (e) => void acionados.push(e) });
    const project = (await new Db(env.DB).projectById(id))!;
    const row = await exports.start(project, { id: 0, role: "admin", permissoes: [] }, "final");
    expect(acionados).toEqual([row.id]);
    expect((await exports.follow(row.id))!.step).toBe(0);
    expect([fake.segments.length, acionados]).toEqual([0, [row.id, row.id]]);
  });

  it("pedir de novo a mesma exportação enquanto ela anda devolve a mesma; outra versão começa outra", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const exports = new Exports(new Db(env.DB), env.MIDIA, new FakeExportApi());
    const project = (await new Db(env.DB).projectById(id))!;
    const conta = { id: 0, role: "admin" as const, permissoes: [] };
    const a = await exports.start(project, conta, "final");
    expect((await exports.start(project, conta, "final")).id).toBe(a.id);
    const so = await exports.start(project, conta, "final", [1]);
    expect(so.id).not.toBe(a.id);
    // Terminada, a mesma volta a ser uma exportação nova.
    for (let i = 0; i < a.total; i++) await exports.advance(a.id);
    expect((await exports.start(project, conta, "final")).id).not.toBe(a.id);
  });

  it("o Durable Object dá os passos pelo alarme, sem pedido nenhum aberto", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    // Os trechos e a versão já estão no R2 (a primeira exportação): os passos não precisam do contêiner.
    await exportar(new FakeExportApi(), id, admin);
    const row = await new Exports(new Db(env.DB), env.MIDIA, new FakeExportApi()).start((await new Db(env.DB).projectById(id))!, { id: 0, role: "admin", permissoes: [] }, "final");
    expect(row.status).toBe("running");
    const stub = env.EXPORTANDO!.get(env.EXPORTANDO!.idFromName(row.id));
    await stub.start(row.id);
    for (const end = Date.now() + 3000; (await new Db(env.DB).exportById(row.id))!.status === "running" && Date.now() < end; ) await new Promise((ok) => setTimeout(ok, 50));
    expect(await new Db(env.DB).exportById(row.id)).toMatchObject({ status: "done" });
    expect(await runInDurableObject(stub, (_, state) => state.storage.get("export"))).toBeUndefined();
  });

  it("dois pedidos juntos não fazem o mesmo passo", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const { id: eid } = (await (await com(fake, `/projetos/${id}/exportar`, admin, { final: "final" })).json()) as Estado;
    await env.DB.prepare("UPDATE exports SET claimed_at = ? WHERE id = ?").bind(new Date().toISOString(), eid).run();
    const st = (await (await com(fake, `/projetos/${id}/exportacoes/${eid}`, admin, {})).json()) as Estado;
    expect([st.status, st.feitos, fake.segments.length]).toEqual(["running", 0, 0]);
  });

  it("recusa bloco com arquivo de outro projeto, de fora ou que não existe", async () => {
    const admin = await cookie();
    const outro = await novo(admin);
    const arquivo = ((await (await post(`/projetos/${outro}/arquivos`, admin, new Uint8Array([1]), { "content-type": "video/mp4" })).json()) as { src: string }).src;
    for (const src of [arquivo, "https://outro.site/x.mp4", "/midia/videos/segredo.mp4", `/videos/${"9".repeat(8)}-9999-4999-8999-${"9".repeat(12)}.mp4`]) {
      const id = await projeto(admin, dados(src));
      const res = await com(new FakeExportApi(), `/projetos/${id}/exportar`, admin, { final: "final" });
      expect([res.status, await res.text()]).toEqual([400, ERROS.exportarArquivo]);
    }
  });

  it("vídeo de outra conta não entra, nem pelo endereço", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    await memberCookie();
    await env.DB.prepare("UPDATE videos SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(VIDEO).run();
    const res = await com(new FakeExportApi(), `/projetos/${id}/exportar`, admin, { final: "final" });
    expect([res.status, await res.text()]).toEqual([400, ERROS.exportarArquivo]);
  });

  it("vídeo de um modelo que a pessoa não pode usar não entra", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    await env.DB.prepare("UPDATE videos SET structure = 'seedance'").run();
    const project = (await new Db(env.DB).projectById(id))!;
    await expect(new Exports(new Db(env.DB), env.MIDIA, new FakeExportApi()).start(project, { id: project.user_id, role: "member", permissoes: [] }, "final")).rejects.toThrow(ERROS.exportarArquivo);
  });

  /** 5 ganchos × 10 CTAs = 50 versões; com 11 CTAs, 55. */
  const muitas = (ctas: number) => {
    const src = `/videos/${VIDEO}.mp4`;
    const ganchos = Array.from({ length: 5 }, (_, i) => bloco(`g${i}`, src, 0, i * 300));
    const fins = Array.from({ length: ctas }, (_, i) => bloco(`c${i}`, src, 400, i * 300, (i + 1) / 100));
    return {
      blocks: [...ganchos, ...fins],
      finals: [{ id: "final", x: 900, y: 0 }],
      edges: [...ganchos.flatMap((g) => fins.map((c) => ({ id: `${g.id}${c.id}`, from: g.id, to: c.id }))), ...fins.map((c) => ({ id: c.id, from: c.id, to: "final" }))],
    };
  };

  it("cada Final exporta até 48 variações, mesmo com mais ligações", async () => {
    const admin = await cookie();
    const fake = new FakeExportApi();
    const ok = await com(fake, `/projetos/${await projeto(admin, muitas(10))}/exportar`, admin, { final: "final" });
    expect([ok.status, ((await ok.json()) as Estado).total]).toEqual([201, 15 + 48]);
    const id = await projeto(admin, muitas(11));
    const mais = await com(fake, `/projetos/${id}/exportar`, admin, { final: "final" });
    expect([mais.status, ((await mais.json()) as Estado).versoes.length <= 48]).toEqual([201, true]);
    expect((await env.DB.prepare("SELECT plan FROM exports ORDER BY rowid DESC LIMIT 1").first<{ plan: string }>())!.plan.match(/"nome"/g)!.length).toBe(48);
  });

  it("sem versão ou sem contêiner, avisa com a frase do catálogo", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const semFinal = await com(new FakeExportApi(), `/projetos/${id}/exportar`, admin, { final: "nada" });
    expect([semFinal.status, await semFinal.text()]).toEqual([400, ERROS.exportarSemVersao]);
    const res = await call(new Request(`${SITE}/projetos/${id}/exportar`, { method: "POST", body: "{}", headers: { origin: SITE, cookie: admin } }), new FakeVideoApi());
    expect([res.status, await res.text()]).toEqual([400, ERROS.exportarIndisponivel]);
  });

  it("exportação de outra pessoa não abre, não anda e não baixa", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    const dela = await novo(admin);
    expect((await com(fake, `/projetos/${dela}/exportacoes/${st.id}`, admin)).status).toBe(404);
    expect((await com(fake, `/projetos/${dela}/exportacoes/${st.id}/0.mp4`, admin)).status).toBe(404);
    const dono = await env.DB.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES ('outro@exemplo.com', 'Outro', 'member', NULL, ?) RETURNING id").bind(new Date().toISOString()).first<{ id: number }>();
    await env.DB.prepare("UPDATE projects SET user_id = ? WHERE id = ?").bind(dono!.id, id).run();
    expect((await com(fake, st.versoes[0]!.href, admin)).status).toBe(404);
    expect((await com(fake, `/projetos/${id}/exportar`, admin, { final: "final" })).status).toBe(404);
    expect((await com(fake, `/projetos/${id}/exportacoes/${st.id}`, admin, {})).status).toBe(404);
  });

  it("depois de 24 horas o arquivo não baixa mais, e a tela sabe", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    await env.DB.prepare("UPDATE exports SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    const res = await com(fake, st.versoes[0]!.href, admin);
    expect([res.status, await res.text()]).toEqual([410, ERROS.exportarExpirou]);
    expect(((await (await com(fake, `/projetos/${id}/exportacoes/${st.id}`, admin)).json()) as Estado).status).toBe("expired");
  });

  it("o agendamento apaga só as exportações vencidas há mais de uma semana", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const st = await exportar(fake, id, admin);
    const nova = await exportar(fake, id, admin);
    await env.DB.prepare("UPDATE exports SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").bind(st.id).run();
    await new Exports(new Db(env.DB), env.MIDIA, fake).next();
    expect(await new Db(env.DB).exportById(st.id)).toBeNull();
    expect(await new Db(env.DB).exportById(nova.id)).not.toBeNull();
  });

  it("quem não é administrador não exporta; o canvas retoma a última", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    const fake = new FakeExportApi();
    const { id: eid } = (await (await com(fake, `/projetos/${id}/exportar`, admin, { final: "final" })).json()) as Estado;
    expect(config(await (await get(`/canvas/${id}`, admin)).text()).exportacao).toMatchObject({ id: eid, status: "running" });
    expect((await com(fake, `/projetos/${id}/exportar`, await memberCookie(), { final: "final" })).status).toBe(404);
  });
});
