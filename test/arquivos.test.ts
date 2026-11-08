import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { contentDisposition, downloadName } from "../src/arquivos";
import { call, cookie, memberCookie, postForm, SITE } from "./helpers";

// Arquivos e o agente: enviar por url (o servidor baixa), baixar com o token e o nome de todo
// download (src/arquivos.ts), o mesmo na tela e no MCP.

const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "teste", version: "1" } };
type Result = { content: { type: string; text?: string }[]; isError?: boolean };

async function ferramenta(name: string, args: unknown): Promise<Result> {
  const req = new Request(`${SITE}/mcp`, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } }),
    headers: { authorization: "Bearer ma_url", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name },
  });
  return ((await (await call(req)).json()) as { result: Result }).result;
}
const dados = <T>(r: Result) => JSON.parse(r.content[0]!.text!) as T;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const original = globalThis.fetch;
let pedidos: string[] = [];

beforeEach(async () => {
  await cookie();
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE role = 'admin'").bind(crypto.randomUUID(), await sha256("ma_url"), new Date().toISOString()).run();
  pedidos = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://imagens.exemplo.com/")) return original(input, init);
    pedidos.push(url);
    if (url.endsWith("/foto%20produto.png")) return Promise.resolve(new Response(PNG, { headers: { "content-type": "image/png; charset=binary" } }));
    if (url.endsWith("/pagina")) return Promise.resolve(new Response("<html><script>alert(1)</script></html>", { headers: { "content-type": "text/html" } }));
    if (url.endsWith("/grande.png")) return Promise.resolve(new Response(new Uint8Array(1), { headers: { "content-type": "image/png", "content-length": String(60 * 1024 * 1024) } }));
    return Promise.resolve(new Response("não", { status: 404 }));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

describe("enviar_arquivo por url", () => {
  it("baixa a imagem, guarda no projeto com o nome do endereço e entra no canvas", async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    const r = await ferramenta("enviar_arquivo", { projeto: id, url: "https://imagens.exemplo.com/fotos/foto%20produto.png" });
    expect(r.isError).toBeFalsy();
    const { src } = dados<{ src: string }>(r);
    expect(src).toContain(`/projetos/${id}/arquivos/`);
    expect(pedidos).toHaveLength(1);
    const { arquivos } = dados<{ arquivos: Record<string, unknown>[] }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["arquivos"] }));
    expect(arquivos[0]).toMatchObject({ nome: "foto produto.png", tipo: "image/png", arquivo: "foto produto.png", mime: "image/png", tamanho: PNG.byteLength, baixar: `${SITE}${src}?baixar` });
    // O arquivo do projeto baixa com o token, pela mesma regra de nome.
    const baixado = await call(new Request(`${SITE}${src}?baixar`, { headers: { authorization: "Bearer ma_url" } }));
    expect(baixado.headers.get("content-disposition")).toBe(contentDisposition("foto produto.png"));
    const editado = await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", arquivo: src.split("/").pop() }] });
    expect(editado.isError).toBeFalsy();
    const projeto = dados<{ grupos: { blocos: { tipo: string }[] }[] }>(await ferramenta("ver_projeto", { projeto: id }));
    expect(projeto.grupos[0]!.blocos[0]!.tipo).toBe("imagem");
  });

  it("recusa HTML, endereço que não responde, grande demais e url que não é http", async () => {
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    for (const url of ["https://imagens.exemplo.com/pagina", "https://imagens.exemplo.com/sumiu.png", "https://imagens.exemplo.com/grande.png", "file:///etc/passwd", "javascript:alert(1)", "nada"]) {
      expect((await ferramenta("enviar_arquivo", { projeto: id, url })).isError, url).toBe(true);
    }
    expect((await env.MIDIA.list({ prefix: `projetos/${id}/` })).objects).toHaveLength(0);
  });
});

describe("nome do arquivo baixado", () => {
  it("é o nome da tela, sem mudança, com a extensão do tipo", () => {
    expect(downloadName("Raposa - Character Sheet", "image/png")).toBe("Raposa - Character Sheet.png");
    expect(downloadName("Coração da marca", "video/mp4")).toBe("Coração da marca.mp4");
    expect(downloadName("principal.png", "image/png")).toBe("principal.png");
    expect(downloadName("foto.jpg", "image/png")).toBe("foto.png");
    expect(downloadName("versão 1.0 final", "video/mp4")).toBe("versão 1.0 final.mp4");
    expect(downloadName('a/b:c*"d"', "image/jpeg")).toBe("a-b-c-d-.jpg");
    expect(downloadName("   ", "audio/mpeg")).toBe("Meu Avatar.mp3");
    expect(downloadName("sem tipo", "", "videos/x.mp4")).toBe("sem tipo.mp4");
  });

  it("o cabeçalho leva o nome em UTF-8 e uma cópia sem acentos", () => {
    expect(contentDisposition("Coração.png")).toBe(`attachment; filename="Coracao.png"; filename*=UTF-8''Cora%C3%A7%C3%A3o.png`);
  });
});

describe("baixar com o token do agente", () => {
  const baixar = (path: string, token = "ma_url") => call(new Request(`${SITE}${path}`, { headers: { authorization: `Bearer ${token}` } }));

  async function avatarComFoto(session: string) {
    const foto = new File([PNG], "principal.png", { type: "image/png" });
    const res = await call(postForm("/avatares", { nome: "Turma ANB", imagem: foto }, { cookie: session }));
    const avatar = res.headers.get("location")!.split("/").pop()!;
    const asset = (await env.DB.prepare("SELECT id FROM avatar_assets WHERE avatar_id = ?").bind(avatar).first<string>("id"))!;
    await env.DB.prepare("UPDATE avatar_assets SET name = 'Raposa - Character Sheet' WHERE id = ?").bind(asset).run();
    return { avatar, asset };
  }

  it("listar_avatares diz o arquivo, o tipo, o tamanho e o endereço; o endereço baixa com o nome e a extensão", async () => {
    const { avatar, asset } = await avatarComFoto(await cookie());
    const lista = dados<{ avatares: { nome: string; ativos: Record<string, unknown>[] }[] }>(await ferramenta("listar_avatares", {}));
    const turma = lista.avatares.find((a) => a.nome === "Turma ANB")!;
    expect(turma.ativos[0]).toMatchObject({ id: asset, nome: "Raposa - Character Sheet", arquivo: "Raposa - Character Sheet.png", mime: "image/png", tamanho: PNG.byteLength, baixar: `${SITE}/avatares/${avatar}/arquivos/${asset}?baixar` });
    const res = await baixar(new URL(String(turma.ativos[0]!.baixar)).pathname + "?baixar");
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(res.headers.get("content-disposition")).toBe(contentDisposition("Raposa - Character Sheet.png"));
  });

  it("listar_videos diz o modelo, o avatar e o arquivo; o vídeo baixa com o token", async () => {
    await cookie();
    const { avatar } = await avatarComFoto(await cookie());
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, avatar_id, name, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, 'completed', 'Oi, gente', 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, 'Gancho', ?, ?)").bind(id, `videos/${id}.mp4`, avatar, now, now).run();
    await env.MIDIA.put(`videos/${id}.mp4`, new Uint8Array([0, 0, 0, 8]), { httpMetadata: { contentType: "video/mp4" } });
    const { videos } = dados<{ videos: Record<string, unknown>[] }>(await ferramenta("listar_videos", {}));
    expect(videos[0]).toMatchObject({ id, nome: "Gancho", modelo: { id: "wan" }, avatar: { id: avatar, nome: "Turma ANB" }, arquivo: "Gancho.mp4", mime: "video/mp4", baixar: `${SITE}/videos/${id}.mp4?baixar` });
    const res = await baixar(`/videos/${id}.mp4?baixar`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(contentDisposition("Gancho.mp4"));
  });

  it("o token não baixa o de outra conta, nem abre páginas", async () => {
    await cookie();
    const { avatar, asset } = await avatarComFoto(await memberCookie());
    expect((await baixar(`/avatares/${avatar}/arquivos/${asset}?baixar`)).status).toBe(404);
    const proprio = await avatarComFoto(await cookie());
    expect((await baixar(`/avatares/${proprio.avatar}/arquivos/${proprio.asset}/ver`)).status).toBe(404);
    expect((await baixar(`/avatares/${proprio.avatar}`)).status).toBe(404);
    expect((await baixar("/videos")).status).toBe(404);
    expect((await baixar(`/avatares/${proprio.avatar}/arquivos/${proprio.asset}?baixar`, "ma_errado")).status).toBe(401);
  });
});
