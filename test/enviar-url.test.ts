import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { call, cookie, SITE } from "./helpers";

// enviar_arquivo com url: o agente sem terminal põe uma imagem da web no projeto (o servidor baixa).

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
    const { arquivos } = dados<{ arquivos: { nome: string; tipo: string }[] }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["arquivos"] }));
    expect(arquivos[0]).toMatchObject({ nome: "foto produto.png", tipo: "image/png" });
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
