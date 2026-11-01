import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { call, cookie, FakeExportApi, FakeVideoApi, memberCookie, SITE } from "./helpers";

const VIDEO = "11111111-1111-4111-8111-111111111111";

async function token(email: string, code: string) {
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE email = ?").bind(crypto.randomUUID(), await sha256(code), new Date().toISOString(), email).run();
  return code;
}

const post = (body: unknown, code: string | null = "ma_admin", headers: Record<string, string> = {}, exporter: FakeExportApi | null = null) =>
  call(new Request(`${SITE}/mcp`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { ...(code ? { authorization: `Bearer ${code}` } : {}), ...headers } }), new FakeVideoApi(), null, null, exporter);

type Result = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "teste", version: "1" } };
/** Os cabeçalhos obrigatórios da revisão 2026-07-28. */
const CABECALHOS = (method: string, name?: unknown): Record<string, string> => ({ "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name ? { "mcp-name": String(name) } : {}) });
const rpc = async (method: string, params: Record<string, unknown> = {}, exporter: FakeExportApi | null = null) =>
  (await (await post({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }, "ma_admin", CABECALHOS(method, params.name), exporter)).json()) as { id: number; result: any; error?: { code: number; data?: unknown } };
const legado = async (method: string, params: unknown = {}) => (await (await post({ jsonrpc: "2.0", id: 1, method, params })).json()) as { result: any; error?: { code: number } };
const ferramenta = async (name: string, args: unknown = {}, exporter: FakeExportApi | null = null) => (await rpc("tools/call", { name, arguments: args }, exporter)).result as Result;
const dados = <T>(r: Result) => JSON.parse(r.content[0]!.text!) as T;

beforeEach(async () => {
  await cookie();
  const { email } = (await env.DB.prepare("SELECT email FROM users WHERE role = 'admin'").first<{ email: string }>())!;
  await token(email, "ma_admin");
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES (?, 'completed', 'Oi, gente', 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)").bind(VIDEO, `videos/${VIDEO}.mp4`, now, now).run();
});

describe("acesso ao MCP", () => {
  it("sem token ou com token errado: 401 com WWW-Authenticate", async () => {
    for (const code of [null, "ma_errado"]) {
      const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, code);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
    }
  });

  it("sessão do navegador não abre o MCP", async () => {
    const res = await call(new Request(`${SITE}/mcp`, { method: "POST", body: "{}", headers: { cookie: await cookie(), origin: SITE } }));
    expect(res.status).toBe(401);
  });

  it("conta comum: 404, como o canvas", async () => {
    await memberCookie();
    expect((await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, await token("membro@exemplo.com", "ma_membro"))).status).toBe(404);
  });

  it("recusa pedido vindo de outro site", async () => {
    expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, "ma_admin", { origin: "https://exemplo.com" })).status).toBe(403);
  });

  it("projeto de outra pessoa é erro da ferramenta, sem mostrar nada", async () => {
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "Dela" }));
    await memberCookie();
    await env.DB.prepare("UPDATE projects SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(id).run();
    const r = await ferramenta("ver_projeto", { projeto: id });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("nao_encontrado");
  });

  it("id com barra não escapa da rota do projeto", async () => {
    const r = await ferramenta("ver_projeto", { projeto: "../../sair" });
    expect(r.isError).toBe(true);
  });
});

describe("protocolo", () => {
  it("server/discover traz as versões, as capacidades e o cache", async () => {
    const { result } = await rpc("server/discover");
    expect(result).toMatchObject({ resultType: "complete", capabilities: { tools: {} }, cacheScope: "public", _meta: { "io.modelcontextprotocol/serverInfo": { name: "meu-avatar" } } });
    expect(result.supportedVersions[0]).toBe("2026-07-28");
    expect(result.ttlMs).toBeGreaterThan(0);
    expect(result.instructions).toContain("ver_quadros");
  });

  it("toda resposta completa diz resultType, e tools/list traz o cache", async () => {
    const { result } = await rpc("tools/list");
    expect(result).toMatchObject({ resultType: "complete", cacheScope: "public" });
    expect(await ferramenta("listar_projetos")).toMatchObject({ resultType: "complete", isError: false });
  });

  it("cabeçalho que falta ou não bate com o corpo: 400 e -32020", async () => {
    const m = (headers: Record<string, string>) => post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_videos", _meta: META } }, "ma_admin", headers);
    for (const h of [{}, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list", "mcp-name": "listar_videos" }, CABECALHOS("tools/call"), CABECALHOS("tools/call", "outro"), { ...CABECALHOS("tools/call", "listar_videos"), "mcp-protocol-version": "2025-11-25" }]) {
      const res = await m(h);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32020);
    }
  });

  it("Mcp-Name em base64 vale pelo valor decodificado", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_videos", _meta: META } }, "ma_admin", { ...CABECALHOS("tools/call"), "mcp-name": `=?base64?${btoa("listar_videos")}?=` });
    expect(res.status).toBe(200);
  });

  it("versão desconhecida: 400 e -32022, com as versões aceitas", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } } }, "ma_admin", { ...CABECALHOS("tools/list"), "mcp-protocol-version": "1900-01-01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32022, data: { requested: "1900-01-01", supported: expect.arrayContaining(["2026-07-28"]) } } });
  });

  it("_meta incompleto: 400 e -32602", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }, "ma_admin", CABECALHOS("tools/list"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32602);
  });

  it("ping saiu da revisão atual: 404 e -32601; método desconhecido também", async () => {
    for (const method of ["ping", "nada"]) {
      const res = await post({ jsonrpc: "2.0", id: 1, method, params: { _meta: META } }, "ma_admin", CABECALHOS(method));
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32601);
    }
  });

  it("cliente antigo: initialize e tools/list sem _meta seguem funcionando", async () => {
    const { result } = await legado("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "meu-avatar" } });
    expect((await legado("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe("2025-11-25");
    expect((await legado("tools/list")).result.tools).toHaveLength(10);
    expect((await legado("ping")).result).toEqual({});
  });

  it("aviso não tem resposta; GET é 405", async () => {
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await call(new Request(`${SITE}/mcp`, { headers: { authorization: "Bearer ma_admin" } }))).status).toBe(405);
  });

  it("ferramenta desconhecida e JSON inválido", async () => {
    expect((await rpc("tools/call", { name: "nada" })).error?.code).toBe(-32602);
    const res = await post("{");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32700);
  });

  it("lista as ferramentas com esquema", async () => {
    const { tools } = (await rpc("tools/list")).result as { tools: { name: string; inputSchema: { type: string } }[] };
    expect(tools.map((t) => t.name)).toEqual(["listar_videos", "listar_projetos", "criar_projeto", "ver_projeto", "editar_projeto", "ver_quadros", "ver_silencios", "enviar_arquivo", "exportar", "acompanhar_exportacao"]);
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
  });
});

describe("ferramentas", () => {
  it("monta e exporta um projeto do começo ao fim", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const fake = new FakeExportApi();
    expect(dados<{ videos: { id: string }[] }>(await ferramenta("listar_videos")).videos[0]!.id).toBe(VIDEO);
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Campanha" }));
    const editado = dados<{ finais: { variacoes: unknown[] }[]; criados: string[] }>(await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", video: VIDEO, fim: 4 }] }));
    expect(editado.finais[0]!.variacoes).toHaveLength(1);
    let e = dados<{ id: string; status: string; versoes: { href: string }[] }>(await ferramenta("exportar", { projeto: id, final: "final" }, fake));
    for (let i = 0; i < 5 && e.status !== "done"; i++) e = dados(await ferramenta("acompanhar_exportacao", { projeto: id, exportacao: e.id }, fake));
    expect(e.status).toBe("done");
    expect(e.versoes[0]!.href).toContain(`/projetos/${id}/exportacoes/`);
  });

  it("revisão velha volta como erro da ferramenta, com a revisão atual", async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", video: VIDEO }] });
    const r = await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "organizar" }] });
    expect(r.isError).toBe(true);
    expect(dados(r)).toEqual({ erro: "conflito", revisao: revisao + 1 });
  });

  it("ver_quadros devolve imagem, e ver_silencios, os silêncios", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const fake = new FakeExportApi();
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    const q = await ferramenta("ver_quadros", { projeto: id, src: `/videos/${VIDEO}.mp4`, instantes: [1, 2] }, fake);
    expect(q.content[0]).toEqual({ type: "image", data: btoa("jpg"), mimeType: "image/jpeg" });
    expect(dados(await ferramenta("ver_silencios", { projeto: id, src: `/videos/${VIDEO}.mp4` }, fake))).toEqual(fake.silences);
  });

  it("enviar_arquivo guarda no projeto; base64 ruim é recusado", async () => {
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    const ok = await ferramenta("enviar_arquivo", { projeto: id, nome: "camada ação.webm", tipo: "video/webm", base64: btoa("webm") });
    expect(dados<{ src: string }>(ok).src).toContain(`/projetos/${id}/arquivos/`);
    expect(dados<{ arquivos: { nome: string }[] }>(await ferramenta("ver_projeto", { projeto: id })).arquivos[0]!.nome).toBe("camada ação.webm");
    expect((await ferramenta("enviar_arquivo", { projeto: id, nome: "x", tipo: "video/webm", base64: "@@@" })).isError).toBe(true);
  });
});
