import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { Db } from "../src/db";
import { call, callFish, cookie, FakeExportApi, FakeFishApi, FakeHeyGenApi, FakeRenderApi, FakeVideoApi, memberCookie, postForm, SITE, webmBytes } from "./helpers";

const VIDEO = "11111111-1111-4111-8111-111111111111";

async function token(email: string, code: string) {
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE email = ?").bind(crypto.randomUUID(), await sha256(code), new Date().toISOString(), email).run();
  return code;
}

const post = (body: unknown, code: string | null = "ma_admin", headers: Record<string, string> = {}, exporter: FakeExportApi | null = null, renderer: FakeRenderApi | null = null) =>
  call(new Request(`${SITE}/mcp`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { ...(code ? { authorization: `Bearer ${code}` } : {}), ...headers } }), new FakeVideoApi(), null, null, exporter, null, renderer);

type Result = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "teste", version: "1" } };
/** Os cabeçalhos obrigatórios da revisão 2026-07-28. */
const CABECALHOS = (method: string, name?: unknown): Record<string, string> => ({ "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name ? { "mcp-name": String(name) } : {}) });
const rpc = async (method: string, params: Record<string, unknown> = {}, exporter: FakeExportApi | null = null, renderer: FakeRenderApi | null = null) =>
  (await (await post({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }, "ma_admin", CABECALHOS(method, params.name), exporter, renderer)).json()) as { id: number; result: any; error?: { code: number; data?: unknown } };
const legado = async (method: string, params: unknown = {}) => (await (await post({ jsonrpc: "2.0", id: 1, method, params })).json()) as { result: any; error?: { code: number } };
const ferramenta = async (name: string, args: unknown = {}, exporter: FakeExportApi | null = null, renderer: FakeRenderApi | null = null) => (await rpc("tools/call", { name, arguments: args }, exporter, renderer)).result as Result;
const dados = <T>(r: Result) => JSON.parse(r.content[0]!.text!) as T;

beforeEach(async () => {
  await cookie();
  const { email } = (await env.DB.prepare("SELECT email FROM users WHERE role = 'admin'").first<{ email: string }>())!;
  await token(email, "ma_admin");
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, 'completed', 'Oi, gente', 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)").bind(VIDEO, `videos/${VIDEO}.mp4`, now, now).run();
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
    // Uma publicação nova chega ao agente em poucos minutos.
    expect(result.ttlMs).toBeGreaterThan(0);
    expect(result.ttlMs).toBeLessThanOrEqual(5 * 60_000);
    expect(result.instructions).toContain("ver_quadros");
  });

  it("toda resposta completa diz resultType, e tools/list traz o cache", async () => {
    const { result } = await rpc("tools/list");
    expect(result).toMatchObject({ resultType: "complete", cacheScope: "public" });
    expect(await ferramenta("listar_projetos")).toMatchObject({ resultType: "complete", isError: false });
  });

  it("cabeçalho que falta ou não bate com o corpo: 400 e -32020", async () => {
    const m = (headers: Record<string, string>) => post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_arquivos", _meta: META } }, "ma_admin", headers);
    for (const h of [{}, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list", "mcp-name": "listar_arquivos" }, CABECALHOS("tools/call"), CABECALHOS("tools/call", "outro"), { ...CABECALHOS("tools/call", "listar_arquivos"), "mcp-protocol-version": "2025-11-25" }]) {
      const res = await m(h);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32020);
    }
  });

  it("Mcp-Name em base64 vale pelo valor decodificado", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_arquivos", _meta: META } }, "ma_admin", { ...CABECALHOS("tools/call"), "mcp-name": `=?base64?${btoa("listar_arquivos")}?=` });
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
    expect((await legado("tools/list")).result.tools).toHaveLength(28);
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
    expect(tools.map((t) => t.name)).toEqual(["listar_arquivos", "listar_avatares", "criar_avatar", "editar_avatar", "enviar_ativo", "listar_vozes", "listar_animacoes", "listar_projetos", "criar_projeto", "ver_projeto", "editar_projeto", "ver_quadros", "ver_cena", "inspecionar_animacao", "ver_transcricao", "ver_silencios", "enviar_arquivo", "gerar_imagem", "gerar_video", "gerar_audio", "acompanhar_video", "renderizar_html", "legendar", "limpar_arquivos", "exportar", "acompanhar_exportacao", "listar_ferramentas", "usar_ferramenta"]);
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
  });
});

describe("ferramentas", () => {
  it("monta e exporta um projeto do começo ao fim", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const fake = new FakeExportApi();
    expect(dados<{ arquivos: { id: string }[] }>(await ferramenta("listar_arquivos")).arquivos[0]!.id).toBe(VIDEO);
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Campanha" }));
    const editado = dados<{ mudou: { finais: { variacoes: unknown[] }[] }; criados: string[] }>(await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", video: VIDEO, fim: 4 }] }));
    expect(editado.mudou.finais[0]!.variacoes).toHaveLength(1);
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
    expect(dados(r)).toMatchObject({ erro: "conflito", revisao: revisao + 1, grupos: [{ blocos: [{ tipo: "video" }] }] });
  });

  it("ver_cena devolve a imagem da cena montada", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    const { criados } = dados<{ criados: string[] }>(await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", video: VIDEO, fim: 4 }] }));
    const grupo = criados[0];
    const fake = new FakeExportApi();
    const q = await ferramenta("ver_cena", { projeto: id, grupo, instantes: [1] }, fake);
    expect(q.content[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
  });

  it("ver_quadros devolve imagem, e ver_silencios, os silêncios", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const fake = new FakeExportApi();
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    const q = await ferramenta("ver_quadros", { projeto: id, src: `/videos/${VIDEO}.mp4`, instantes: [1, 2] }, fake);
    expect(q.content[0]).toEqual({ type: "image", data: btoa("jpg"), mimeType: "image/jpeg" });
    expect(dados(await ferramenta("ver_silencios", { projeto: id, src: `/videos/${VIDEO}.mp4` }, fake))).toEqual(fake.silences);
  });

  it("inspecionar_animacao responde em texto; com quadros: true, o mosaico vem como imagem", async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    const { criados } = dados<{ criados: string[] }>(await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", html: '<div id="titulo">Oi</div>', duracao: 4 }] }));
    const r = new FakeRenderApi();
    const texto = await ferramenta("inspecionar_animacao", { projeto: id, bloco: criados[0], instantes: [0, 1] }, null, r);
    expect(texto.content).toHaveLength(1);
    expect(dados<{ problemas: { tipo: string }[] }>(texto).problemas[0]!.tipo).toBe("quebrou");
    expect(r.inspections[0]).toMatchObject({ html: '<div id="titulo">Oi</div>', duracao: 4, instantes: [0, 1], quadros: false });
    const comImagem = await ferramenta("inspecionar_animacao", { projeto: id, bloco: criados[0], quadros: true }, null, r);
    expect(comImagem.content[1]).toEqual({ type: "image", data: btoa("jpg"), mimeType: "image/jpeg" });
    expect(comImagem.content[0]!.text).not.toContain("quadros");
    expect(r.inspections[1]).toMatchObject({ instantes: [0, 1, 2, 3, 4], quadros: true });
  });

  it("contêiner que não responde é erro da ferramenta, e o pedido não cai", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const fake = new FakeExportApi();
    fake.fail = "The container service is unreachable, try again later";
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    const q = await ferramenta("ver_quadros", { projeto: id, src: `/videos/${VIDEO}.mp4`, instantes: [1] }, fake);
    expect(q.isError).toBe(true);
    expect(dados(q)).toEqual({ erro: "conteiner_falhou" });
  });

  it("listar_arquivos passa os filtros, a busca, a data, o limite e o continuar", async () => {
    const um = dados<{ arquivos: { id: string }[]; continuar?: string }>(await ferramenta("listar_arquivos", { tipo: "video", fonte: "gerado", modelo: "wan", busca: "Oi", desde: "2020-01-01", limite: 1 }));
    expect(um.arquivos.map((v) => v.id)).toEqual([VIDEO]);
    expect(um.continuar).toBeUndefined();
    expect(dados<{ arquivos: unknown[] }>(await ferramenta("listar_arquivos", { ate: "2020-01-01" })).arquivos).toEqual([]);
    expect(dados<{ arquivos: unknown[] }>(await ferramenta("listar_arquivos", { tipo: "audio", fonte: "gerado" })).arquivos).toEqual([]);
  });

  it("limpar_arquivos mostra os sem uso e só apaga com apagar: true", async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    const envia = async (nome: string) => dados<{ src: string }>(await ferramenta("enviar_arquivo", { projeto: id, nome, tipo: "video/webm", base64: btoa("webm") })).src;
    const usado = await envia("usado.webm");
    const velho = await envia("velho.webm");
    await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", arquivo: usado.split("/").pop(), dur: 2 }] });
    const lista = dados<{ arquivos: { nome: string }[]; tamanho: number }>(await ferramenta("limpar_arquivos", { projeto: id }));
    expect(lista).toEqual({ arquivos: [expect.objectContaining({ nome: "velho.webm" })], tamanho: 4 });
    expect((await env.MIDIA.list({ prefix: `projetos/${id}/` })).objects).toHaveLength(2);
    expect(dados(await ferramenta("limpar_arquivos", { projeto: id, apagar: true }))).toMatchObject({ apagados: true });
    const { arquivos } = dados<{ arquivos: { src: string }[] }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["arquivos"] }));
    expect(arquivos.map((f) => f.src)).toEqual([usado]);
    expect((await env.MIDIA.list({ prefix: `projetos/${id}/` })).objects).toHaveLength(1);
    expect(velho).not.toBe(usado);
  });

  it("enviar_arquivo guarda no projeto; base64 ruim é recusado", async () => {
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    const ok = await ferramenta("enviar_arquivo", { projeto: id, nome: "camada ação.webm", tipo: "video/webm", base64: btoa("webm") });
    expect(dados<{ src: string }>(ok).src).toContain(`/projetos/${id}/arquivos/`);
    expect(dados<{ arquivos: { nome: string }[] }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["arquivos"] })).arquivos[0]!.nome).toBe("camada ação.webm");
    expect((await ferramenta("enviar_arquivo", { projeto: id, nome: "x", tipo: "video/webm", base64: "@@@" })).isError).toBe(true);
  });

  it("WebM sem som entra sem a camada de áudio; com som, ligado a ela", async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const envia = async (nome: string, som: boolean) => dados<{ src: string; som: boolean }>(await ferramenta("enviar_arquivo", { projeto: id, nome, tipo: "video/webm", base64: b64(webmBytes(som)) }));
    const mudo = await envia("titulo.webm", false);
    const falado = await envia("fala.webm", true);
    expect([mudo.som, falado.som]).toEqual([false, true]);
    const arquivo = (src: string) => src.split("/").pop();
    const r = await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", arquivo: arquivo(mudo.src), dur: 2 }, { tipo: "adicionar", arquivo: arquivo(falado.src), dur: 2 }] });
    expect(r.isError).toBe(false);
    const { canvas } = dados<{ canvas: { blocks: { name: string; audio: string }[] } }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["canvas"] }));
    expect(canvas.blocks.map((b) => [b.name, b.audio])).toEqual([["titulo.webm", "none"], ["fala.webm", "linked"]]);
  });
});

describe("ferramentas publicadas depois de conectar", () => {
  it("listar_ferramentas traz todas, curtas, e uma inteira pelo nome", async () => {
    const { ferramentas } = dados<{ ferramentas: { nome: string; descricao: string }[] }>(await ferramenta("listar_ferramentas"));
    const nomes = ferramentas.map((f) => f.nome);
    expect(nomes).toContain("enviar_ativo");
    expect(nomes).not.toContain("usar_ferramenta");
    // Curta: a do editar_projeto tem milhares de caracteres.
    expect(Math.max(...ferramentas.map((f) => f.descricao.length))).toBeLessThanOrEqual(240);
    const uma = dados<{ nome: string; descricao: string; parametros: { required: string[] } }>(await ferramenta("listar_ferramentas", { nome: "gerar_audio" }));
    expect(uma.parametros.required).toEqual(["texto", "voz"]);
    expect(uma.descricao.length).toBeGreaterThan(240);
    expect(dados<{ ferramentas: { nome: string }[] }>(await ferramenta("listar_ferramentas", { busca: "avatar" })).ferramentas.map((f) => f.nome)).toContain("criar_avatar");
    expect((await ferramenta("listar_ferramentas", { nome: "nao_existe" })).isError).toBe(true);
  });

  it("usar_ferramenta chama qualquer uma pelo nome, com as mesmas regras", async () => {
    const r = await ferramenta("usar_ferramenta", { nome: "criar_projeto", argumentos: { nome: "Pela outra" } });
    expect(r.isError).toBeFalsy();
    const { id } = dados<{ id: string }>(r);
    expect(dados<{ nome: string }>(await ferramenta("usar_ferramenta", { nome: "ver_projeto", argumentos: { projeto: id } })).nome).toBe("Pela outra");
    // O erro da ferramenta volta como dela.
    const erro = await ferramenta("usar_ferramenta", { nome: "ver_projeto", argumentos: { projeto: crypto.randomUUID() } });
    expect(erro.isError).toBe(true);
    expect(erro.content[0]!.text).toContain("nao_encontrado");
    // Sem volta infinita e sem ferramenta inventada.
    for (const nome of ["usar_ferramenta", "nao_existe", ""]) {
      const r = await ferramenta("usar_ferramenta", { nome, argumentos: {} });
      expect(r.isError, nome).toBe(true);
      expect(r.content[0]!.text).toContain("ferramenta_inexistente");
    }
    expect(dados<{ ferramentas: unknown[] }>(await ferramenta("usar_ferramenta", { nome: "listar_ferramentas" })).ferramentas.length).toBeGreaterThan(20);
  });

  it("projeto de outra conta segue fechado pela usar_ferramenta", async () => {
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "Dela" }));
    await memberCookie();
    await env.DB.prepare("UPDATE projects SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(id).run();
    const r = await ferramenta("usar_ferramenta", { nome: "ver_projeto", argumentos: { projeto: id } });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("nao_encontrado");
  });
});

describe("gerar_imagem", () => {
  /** A ferramenta com um OpenRouter falso guardado, para ver o pedido de imagem. */
  const comApi = async (api: FakeVideoApi, name: string, args: unknown) => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } };
    const res = await call(new Request(`${SITE}/mcp`, { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer ma_admin", ...CABECALHOS("tools/call", name) } }), api);
    return ((await res.json()) as { result: Result }).result;
  };

  it("gera no formato do projeto, devolve a imagem para o agente olhar e ela entra com adicionar {imagem}", async () => {
    const api = new FakeVideoApi();
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Esboço" }));
    const r = await comApi(api, "gerar_imagem", { projeto: id, descricao: "mulher na cozinha com um sérum roxo" });
    expect(r.isError).toBeFalsy();
    const { imagem } = dados<{ imagem: { id: string; src: string; formato: string; resolucao: string; custo: number } }>(r);
    expect(imagem).toMatchObject({ src: `/videos/${imagem.id}.png`, formato: "9:16", resolucao: "1K", custo: 0.039 });
    expect(r.content[1]).toEqual({ type: "image", data: btoa("png-falso"), mimeType: "image/png" });
    expect(r.content[0]!.text).not.toContain("previa");
    expect(api.images[0]).toMatchObject({ resolution: "1K", aspect_ratio: "9:16" });
    expect(api.images[0]!.input_references).toBeUndefined();

    // Outra, partindo da primeira: ela vai como referência.
    await comApi(api, "gerar_imagem", { projeto: id, descricao: "a mesma cena, sorrindo mais", referencia: imagem.src, formato: "1:1" });
    expect(api.images[1]!.input_references).toHaveLength(1);
    expect(api.images[1]!.aspect_ratio).toBe("1:1");

    const editado = await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", imagem: imagem.id, fim: 2 }] });
    expect(editado.isError).toBe(false);
    const { canvas } = dados<{ canvas: { blocks: { kind: string; src: string; tout: number }[] } }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["canvas"] }));
    expect(canvas.blocks[0]).toMatchObject({ kind: "image", src: imagem.src, tout: 2 });
  });

  it("imagem não entra como vídeo, nem vídeo como imagem", async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "A" }));
    const { imagem } = dados<{ imagem: { id: string } }>(await ferramenta("gerar_imagem", { projeto: id, descricao: "uma cena" }));
    for (const comando of [{ tipo: "adicionar", video: imagem.id, dur: 2 }, { tipo: "adicionar", imagem: VIDEO }]) {
      const r = await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [comando] });
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain("arquivo_indisponivel");
    }
  });

  it("recusa sem descrição, referência que não existe ou não é imagem, formato fora do modelo; falha da API vira imagem_falhou", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "video/mp4" } });
    const { id } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "A" }));
    const api = new FakeVideoApi();
    const casos: [Record<string, unknown>, string][] = [
      [{ descricao: " " }, "descricao_obrigatoria"],
      [{ descricao: "cena", referencia: "/videos/00000000-0000-4000-8000-000000000000.png" }, "arquivo_indisponivel"],
      [{ descricao: "cena", referencia: `/videos/${VIDEO}.mp4` }, "referencia_nao_e_imagem"],
      [{ descricao: "cena", formato: "7:3" }, "pedido_invalido"],
      [{ descricao: "cena", final: "outro" }, "final_inexistente"],
    ];
    for (const [args, erro] of casos) {
      const r = await comApi(api, "gerar_imagem", { projeto: id, ...args });
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain(erro);
    }
    expect(api.images).toHaveLength(0);
    api.failImage = "OpenRouter respondeu HTTP 500";
    const r = await comApi(api, "gerar_imagem", { projeto: id, descricao: "cena" });
    expect(r.content[0]!.text).toContain("imagem_falhou");
    expect(r.content[0]!.text).not.toContain("HTTP 500");
  });
});

describe("gerar_video", () => {
  /** A ferramenta com a HeyGen falsa (API direta, como no ar) e o OpenRouter falso (a foto vem do gerar_imagem). */
  const comHeyGen = async (heygen: FakeHeyGenApi | null, name: string, args: unknown, code = "ma_admin", exporter: FakeExportApi | null = null) => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } };
    const res = await call(new Request(`${SITE}/mcp`, { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${code}`, ...CABECALHOS("tools/call", name) } }), new FakeVideoApi(), null, heygen, exporter);
    return ((await res.json()) as { result: Result }).result;
  };
  /** Um projeto e uma foto gerada para animar. */
  const preparar = async () => {
    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Vídeo" }));
    const { imagem } = dados<{ imagem: { src: string } }>(await ferramenta("gerar_imagem", { projeto: id, descricao: "mulher sorrindo" }));
    return { id, revisao, foto: imagem.src };
  };

  it("lista as vozes, gera pela HeyGen direta no formato do projeto, acompanha e o vídeo pronto entra no projeto", async () => {
    await new Db(env.DB).setPlatform("heygen");
    const heygen = new FakeHeyGenApi();
    const { id, revisao, foto } = await preparar();
    const vozes = dados<{ prontas: { id: string; nome: string; idioma: string; genero: string }[]; clonadas: unknown[] }>(await comHeyGen(heygen, "listar_vozes", { genero: "feminina" }));
    expect(vozes.prontas).toEqual([{ id: "voz-ana|pt-BR", nome: "Ana", idioma: "Português", genero: "feminina" }]);

    const r = await comHeyGen(heygen, "gerar_video", { projeto: id, foto, fala: "Oi, gente! Hoje eu vou mostrar o meu sérum favorito.", voz: vozes.prontas[0]!.id });
    expect(r.isError).toBeFalsy();
    const { video } = dados<{ video: { id: string; status: string; formato: string; custoEstimado: number; duracaoEstimada: number } }>(r);
    expect(video).toMatchObject({ formato: "9:16" });
    // O preço da API direta (US$ 0,0385/s), não o do OpenRouter.
    expect(video.custoEstimado).toBe(+(0.0385 * video.duracaoEstimada).toFixed(2));
    expect(heygen.videos).toHaveLength(1);
    expect(JSON.stringify(heygen.videos[0])).toContain("voz-ana");

    expect(dados(await comHeyGen(heygen, "acompanhar_video", { video: video.id }))).toMatchObject({ status: "gerando" });
    const job = (await new Db(env.DB).videoById(video.id))!.job_id!;
    heygen.finish(job, { status: "completed", video_url: "https://files.heygen.ai/v.mp4", duration: 4 });
    const pronto = dados<{ status: string; src: string; usar: { video: string } }>(await comHeyGen(heygen, "acompanhar_video", { video: video.id }));
    expect(pronto).toMatchObject({ status: "pronto", src: `/videos/${video.id}.mp4`, usar: { video: video.id } });
    expect((await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", ...pronto.usar }] })).isError).toBe(false);
  });

  it("recusa sem foto, sem fala, foto que não é imagem, voz que não existe e áudio pelo OpenRouter, sem pedir vídeo", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "video/mp4" } });
    const heygen = new FakeHeyGenApi();
    const { id, foto } = await preparar();
    const casos: [Record<string, unknown>, string][] = [
      [{ fala: "Oi", voz: "voz-ana|pt-BR" }, "foto_obrigatoria"],
      [{ foto, voz: "voz-ana|pt-BR" }, "fala_obrigatoria"],
      [{ foto: `/videos/${VIDEO}.mp4`, fala: "Oi", voz: "voz-ana|pt-BR" }, "foto_tipo_invalido"],
      [{ foto, fala: "Oi", voz: "nao-existe" }, "pedido_invalido"],
      [{ foto, fala: "Oi", voz: "voz-ana|pt-BR", final: "outro" }, "final_inexistente"],
      // Pelo OpenRouter (a plataforma padrão dos testes), o áudio próprio não existe.
      [{ foto, audio: `/videos/${VIDEO}.mp4` }, "audio_indisponivel"],
    ];
    for (const [args, erro] of casos) {
      const r = await comHeyGen(heygen, "gerar_video", { projeto: id, ...args });
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain(erro);
    }
    expect(heygen.videos).toHaveLength(0);
  });

  it("a fala montada no canvas vira o áudio: o som de uma exportação deste projeto, e só dele", async () => {
    await new Db(env.DB).setPlatform("heygen");
    const heygen = new FakeHeyGenApi(), fake = new FakeExportApi();
    const { id, foto } = await preparar();
    const outro = (await preparar()).id;
    /** Uma exportação pronta do projeto, com o vídeo da versão no R2. */
    const exportacao = async (projeto: string) => {
      const eid = crypto.randomUUID(), chave = `exportacoes/versoes/${eid.replaceAll("-", "")}.mp4`, agora = new Date();
      await env.MIDIA.put(chave, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "video/mp4" } });
      const plan = { trechos: [], versoes: [{ nome: "Variação 1", trechos: [], chave, tamanho: 3, crc: 0 }] };
      await env.DB.prepare("INSERT INTO exports (id, project_id, status, step, total, plan, created_at, expires_at) VALUES (?, ?, 'done', 1, 1, ?, ?, ?)")
        .bind(eid, projeto, JSON.stringify(plan), agora.toISOString(), new Date(agora.getTime() + 3600_000).toISOString())
        .run();
      return `/projetos/${projeto}/exportacoes/${eid}/0.mp3`;
    };
    const alheio = await exportacao(outro);
    const recusado = await comHeyGen(heygen, "gerar_video", { projeto: id, foto, audio: alheio }, "ma_admin", fake);
    expect([recusado.isError, recusado.content[0]!.text]).toEqual([true, expect.stringContaining("arquivo_indisponivel")]);
    const r = await comHeyGen(heygen, "gerar_video", { projeto: id, foto, audio: await exportacao(id) }, "ma_admin", fake);
    expect(r.isError).toBeFalsy();
    expect(fake.inspected.map((i) => i.path)).toEqual(["/som"]);
    expect(heygen.videos).toHaveLength(1);
  });

  it("vídeo de outra conta não se acompanha", async () => {
    const alheio = "66666666-6666-4666-8666-666666666666";
    await memberCookie();
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE email = 'membro@exemplo.com'), ?, 'pending', 'Oi', 'heygen/avatar-iv', 5, '720p', '9:16', 'heygen', ?, ?)").bind(alheio, now, now).run();
    const r = await comHeyGen(null, "acompanhar_video", { video: alheio });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("nao_encontrado");
  });
});

describe("gerar_audio", () => {
  /** A ferramenta com o OpenRouter, o Fish e a HeyGen falsos, para ver o pedido de fala. */
  const comFish = async (api: FakeVideoApi, fish: FakeFishApi, name: string, args: unknown, heygen: FakeHeyGenApi | null = null) => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } };
    const res = await callFish(new Request(`${SITE}/mcp`, { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer ma_admin", ...CABECALHOS("tools/call", name) } }), api, fish, heygen);
    return ((await res.json()) as { result: Result }).result;
  };

  it("lista as vozes do Fish, gera na hora com as emoções em inglês e o áudio entra no projeto e no gerar_video", async () => {
    await new Db(env.DB).setPlatform("heygen");
    const api = new FakeVideoApi(), fish = new FakeFishApi(), heygen = new FakeHeyGenApi();
    const vozes = dados<{ prontas: { id: string; nome: string; idioma: string; genero: string }[] }>(await comFish(api, fish, "listar_vozes", { modelo: "fish", genero: "masculina", idioma: "Brasil" }));
    expect(vozes.prontas).toEqual([{ id: "fish-caio", nome: "Caio", idioma: "Português (Brasil)", genero: "masculina" }]);

    const r = await comFish(api, fish, "gerar_audio", { texto: "[risada] Olha que legal!", voz: "fish-caio" });
    expect(r.isError).toBeFalsy();
    const { audio, usar } = dados<{ audio: { id: string; src: string; modelo: string; voz: string; custo: number; duracao: number }; usar: { audio: string } }>(r);
    expect(audio).toMatchObject({ src: `/videos/${audio.id}.mp3`, modelo: "fish", voz: "Caio" });
    expect(audio.duracao).toBeGreaterThan(0);
    expect(usar).toEqual({ audio: audio.id });
    expect(api.speeches).toEqual([{ model: "fish-audio/drama-3", input: "[laughs] Olha que legal!", voice: "fish-caio" }]);

    const { id, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Fala" }));
    expect((await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", ...usar }] })).isError).toBe(false);
    // A fala vira o áudio do avatar no gerar_video (Meu áudio, HeyGen direta).
    const { imagem } = dados<{ imagem: { src: string } }>(await comFish(api, fish, "gerar_imagem", { projeto: id, descricao: "touro sorrindo" }));
    const v = await comFish(api, fish, "gerar_video", { projeto: id, foto: imagem.src, audio: audio.src }, heygen);
    expect(v.isError).toBeFalsy();
    expect(heygen.assets.find((a) => a.type === "audio/mpeg")).toBeDefined();
    expect(heygen.videos[0]!.audio_asset_id).toBeDefined();
  });

  it("a voz do avatar: aparece entre as clonadas, pede o consentimento na primeira vez e manda a gravação", async () => {
    const api = new FakeVideoApi(), fish = new FakeFishApi();
    const gravacao = new File([new TextEncoder().encode("voz-do-urso")], "voz.mp3", { type: "audio/mpeg" });
    const res = await call(postForm("/avatares", { nome: "Urso", imagem: new File([new Uint8Array([137, 80, 78, 71])], "urso.png", { type: "image/png" }), voz: gravacao }, { cookie: await cookie() }));
    const avatar = res.headers.get("location")!.split("/").pop()!;
    const { clonadas } = dados<{ clonadas: { id: string; nome: string; clonarNoPrimeiroUso?: boolean }[] }>(await comFish(api, fish, "listar_vozes", { modelo: "fish" }));
    expect(clonadas).toEqual([{ id: `avatar:${avatar}`, nome: "Voz de Urso", clonarNoPrimeiroUso: true }]);

    const sem = await comFish(api, fish, "gerar_audio", { texto: "Bom dia, turma!", voz: `avatar:${avatar}` });
    expect(sem.isError).toBe(true);
    expect(sem.content[0]!.text).toContain("pedido_invalido");
    const r = await comFish(api, fish, "gerar_audio", { texto: "Bom dia, turma!", voz: `avatar:${avatar}`, consentimento: true });
    expect(dados<{ audio: { voz: string; clonada: boolean } }>(r).audio).toMatchObject({ voz: "Voz de Urso", clonada: true });
    expect(api.speeches[0]!.voice).toBeUndefined();
    expect(new TextDecoder().decode(api.speeches[0]!.reference!.bytes)).toBe("voz-do-urso");
    // Da segunda vez, sem consentimento.
    expect((await comFish(api, fish, "gerar_audio", { texto: "De novo.", voz: `avatar:${avatar}` })).isError).toBeFalsy();
  });

  it("ElevenLabs pelo modelo; recusa modelo que não fala, sem texto, sem voz e voz que o modelo não tem, sem gastar", async () => {
    const api = new FakeVideoApi(), fish = new FakeFishApi();
    const { prontas } = dados<{ prontas: { id: string }[] }>(await comFish(api, fish, "listar_vozes", { modelo: "elevenlabs", busca: "sarah" }));
    expect(prontas.map((v) => v.id)).toEqual(["sarah"]);
    const casos: [Record<string, unknown>, string][] = [
      [{ modelo: "wan", texto: "Oi", voz: "sarah" }, "modelo_inexistente"],
      [{ texto: " ", voz: "fish-caio" }, "texto_obrigatorio"],
      [{ texto: "Oi" }, "voz_obrigatoria"],
      [{ modelo: "elevenlabs", texto: "Oi", voz: "fish-caio" }, "pedido_invalido"],
      [{ texto: "[risada]", voz: "fish-caio" }, "pedido_invalido"],
    ];
    for (const [args, erro] of casos) {
      const r = await comFish(api, fish, "gerar_audio", args);
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain(erro);
    }
    expect((await comFish(api, fish, "listar_vozes", { modelo: "wan" })).content[0]!.text).toContain("modelo_inexistente");
    expect(api.speeches).toHaveLength(0);
    const r = await comFish(api, fish, "gerar_audio", { modelo: "elevenlabs", texto: "Oi, gente!", voz: "sarah" });
    expect(dados<{ audio: { modelo: string } }>(r).audio.modelo).toBe("elevenlabs");
    expect(api.speeches[0]).toMatchObject({ model: "elevenlabs/eleven-v4", voice: "sarah" });
  });

  it("conta comum sem os modelos de fala não lista nem gera", async () => {
    await memberCookie();
    const code = await token("membro@exemplo.com", "ma_membro");
    const res = await call(new Request(`${SITE}/api/v1/audios`, { method: "POST", body: JSON.stringify({ texto: "Oi", voz: "fish-caio" }), headers: { authorization: `Bearer ${code}` } }));
    expect(res.status).toBe(404);
  });
});

describe("vídeo de outra conta", () => {
  it("o listar_arquivos do agente não traz", async () => {
    const alheio = "55555555-5555-4555-8555-555555555555";
    await memberCookie();
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE email = 'membro@exemplo.com'), ?, 'completed', 'Oi, gente', 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)").bind(alheio, `videos/${alheio}.mp4`, now, now).run();
    const ids = dados<{ arquivos: { id: string }[] }>(await ferramenta("listar_arquivos")).arquivos.map((v) => v.id);
    expect(ids).toContain(VIDEO);
    expect(ids).not.toContain(alheio);
  });
});
