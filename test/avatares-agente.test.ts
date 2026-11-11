import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { criarEnvio, ENVIO_MS } from "../src/ativos";
import { call, callFish, cookie, FakeFishApi, FakeVideoApi, memberCookie, SITE } from "./helpers";

// O agente cria e muda avatares e envia ativos sem base64: por url (o site baixa) ou pelo link de
// envio (um curl do computador, sem token). O link não pode abrir nada além de um arquivo para um avatar.

const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "teste", version: "1" } };
type Result = { content: { type: string; text?: string }[]; isError?: boolean };

async function ferramenta(name: string, args: unknown, code = "ma_av"): Promise<Result> {
  const req = new Request(`${SITE}/mcp`, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } }),
    headers: { authorization: `Bearer ${code}`, "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name },
  });
  return ((await (await callFish(req, new FakeVideoApi(), new FakeFishApi())).json()) as { result: Result }).result;
}
const dados = <T>(r: Result) => JSON.parse(r.content[0]!.text!) as T;
/** O curl do agente: o arquivo cru, sem token nem cookie. */
const enviar = (url: string, body: BodyInit, type: string, headers: Record<string, string> = {}) => call(new Request(url, { method: "POST", body, headers: { "content-type": type, ...headers } }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MP3 = new TextEncoder().encode("voz-do-touro");
const original = globalThis.fetch;

type Ativo = { id: string; nome: string; tipo: string; foto: boolean; voz: boolean; src: string };
type Envio = { envio: { url: string; metodo: string; expira: string; comando: string } };
const admin = async () => (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!.id;

beforeEach(async () => {
  await cookie();
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE role = 'admin'").bind(crypto.randomUUID(), await sha256("ma_av"), new Date().toISOString()).run();
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://arquivos.exemplo.com/")) return original(input, init);
    if (url.endsWith("/touro.png")) return Promise.resolve(new Response(PNG, { headers: { "content-type": "image/png" } }));
    if (url.endsWith("/pagina")) return Promise.resolve(new Response("<html></html>", { headers: { "content-type": "text/html" } }));
    return Promise.resolve(new Response("não", { status: 404 }));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

describe("avatares pelo agente", () => {
  it("cria o avatar, envia a foto por url como foto principal e muda o nome", async () => {
    expect(dados<{ erro: string }>(await ferramenta("criar_avatar", { nome: " " })).erro).toBe("nome_obrigatorio");
    const { avatar } = dados<{ avatar: { id: string; nome: string } }>(await ferramenta("criar_avatar", { nome: "Touro", descricao: "Otimista da bolsa." }));
    const r = await ferramenta("enviar_ativo", { avatar: avatar.id, url: "https://arquivos.exemplo.com/touro.png", uso: "foto" });
    expect(r.isError).toBeFalsy();
    const { ativo } = dados<{ ativo: Ativo }>(r);
    expect(ativo).toMatchObject({ nome: "touro.png", tipo: "imagem", foto: true, voz: false, src: `/avatares/${avatar.id}/arquivos/${ativo.id}` });
    // Imagem não vira voz; página HTML não entra.
    expect(dados<{ erro: string }>(await ferramenta("enviar_ativo", { avatar: avatar.id, url: "https://arquivos.exemplo.com/touro.png", uso: "voz" })).erro).toBe("uso_invalido");
    expect((await ferramenta("enviar_ativo", { avatar: avatar.id, url: "https://arquivos.exemplo.com/pagina" })).isError).toBe(true);

    expect(dados(await ferramenta("editar_avatar", { avatar: avatar.id, nome: "Touro da Bolsa" }))).toMatchObject({ avatar: { nome: "Touro da Bolsa", descricao: "Otimista da bolsa.", foto: ativo.id } });
    expect(dados<{ erro: string }>(await ferramenta("editar_avatar", { avatar: avatar.id, voz: ativo.id })).erro).toBe("uso_invalido");
    expect(dados<{ erro: string }>(await ferramenta("editar_avatar", { avatar: avatar.id, foto: crypto.randomUUID() })).erro).toBe("ativo_inexistente");
    expect(dados(await ferramenta("editar_avatar", { avatar: avatar.id, foto: "" }))).toMatchObject({ avatar: { foto: null } });
    const { avatares } = dados<{ avatares: { id: string; nome: string; ativos: Ativo[] }[] }>(await ferramenta("listar_avatares", {}));
    expect(avatares.find((a) => a.id === avatar.id)).toMatchObject({ nome: "Touro da Bolsa", ativos: [{ id: ativo.id, foto: false }] });
  });

  it("o link de envio recebe o arquivo do computador, sem token, e a voz vira a Voz do avatar no Fish", async () => {
    const { avatar } = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Touro" }));
    const { envio } = dados<Envio>(await ferramenta("enviar_ativo", { avatar: avatar.id, nome: "Voz do Touro.mp3", uso: "voz", tipo: "audio/mpeg" }));
    expect(envio.url).toMatch(new RegExp(`^${SITE}/envio/[0-9a-f]{64}$`));
    expect(envio.comando).toContain(envio.url);
    expect(envio.comando).toContain('content-type: audio/mpeg');
    expect(envio.comando).not.toContain("Bearer");
    expect(Date.parse(envio.expira) - Date.now()).toBeLessThanOrEqual(ENVIO_MS);

    const res = await enviar(envio.url, MP3, "audio/mpeg");
    expect(res.status).toBe(201);
    const { ativo } = (await res.json()) as { ativo: string };
    const a = await env.DB.prepare("SELECT voice_asset FROM avatars WHERE id = ?").bind(avatar.id).first<{ voice_asset: string }>();
    expect(a!.voice_asset).toBe(ativo);
    expect((await env.DB.prepare("SELECT name, type, size FROM avatar_assets WHERE id = ?").bind(ativo).first())).toEqual({ name: "Voz do Touro.mp3", type: "audio/mpeg", size: MP3.byteLength });
    const { clonadas } = dados<{ clonadas: { nome: string }[] }>(await ferramenta("listar_vozes", { modelo: "fish" }));
    expect(clonadas.map((c) => c.nome)).toContain("Voz de Touro");
    // Um envio só: o mesmo link não serve de novo.
    expect((await enviar(envio.url, MP3, "audio/mpeg")).status).toBe(404);
  });
});

describe("segurança do link de envio", () => {
  const link = async (args: Record<string, unknown> = {}) => {
    const { avatar } = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Urso" }));
    return { avatar: avatar.id, url: dados<Envio>(await ferramenta("enviar_ativo", { avatar: avatar.id, ...args })).envio.url };
  };
  const ativos = async (avatar: string) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM avatar_assets WHERE avatar_id = ?").bind(avatar).first<{ n: number }>())!.n;

  it("guarda só o hash do código, no R2, fora do alcance do site", async () => {
    const { url } = await link();
    const codigo = url.split("/").pop()!;
    const guardados = (await env.MIDIA.list({ prefix: "envios/" })).objects.map((o) => o.key);
    expect(guardados).toContain(`envios/${await sha256(codigo)}`);
    expect(guardados.join()).not.toContain(codigo);
    // O ticket não é um arquivo que o site serve.
    expect((await call(new Request(`${SITE}/midia/envios/${await sha256(codigo)}`))).status).not.toBe(200);
  });

  it("uma tentativa só: tipo fora da lista (HTML, SVG, formulário de outro site) gasta o link sem guardar nada", async () => {
    for (const [body, type] of [
      ["<html><script>alert(1)</script></html>", "text/html"],
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "image/svg+xml"],
      ["nome=x", "application/x-www-form-urlencoded"],
    ] as const) {
      const { avatar, url } = await link();
      const res = await enviar(url, body, type, { origin: "https://outro.site" });
      expect(res.status).toBe(415);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect((await enviar(url, PNG, "image/png")).status).toBe(404);
      expect(await ativos(avatar)).toBe(0);
    }
  });

  it("recusa grande demais, vazio e uso que não combina com o arquivo", async () => {
    let l = await link();
    expect((await enviar(l.url, PNG, "image/png", { "content-length": String(11 * 1024 * 1024) })).status).toBe(413);
    l = await link();
    expect((await enviar(l.url, new Uint8Array(0), "image/png")).status).toBe(400);
    l = await link({ uso: "voz" });
    expect(((await (await enviar(l.url, PNG, "image/png")).json()) as { erro: string }).erro).toBe("uso_invalido");
    expect(await ativos(l.avatar)).toBe(0);
  });

  it("código que não existe, vencido, GET e caminho estranho não abrem nada", async () => {
    expect((await enviar(`${SITE}/envio/${"a".repeat(64)}`, PNG, "image/png")).status).toBe(404);
    const avatar = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Velho" })).avatar.id;
    const vencido = await criarEnvio(env.MIDIA, await admin(), avatar, "", "", Date.now() - ENVIO_MS - 1000);
    expect((await enviar(`${SITE}/envio/${vencido.codigo}`, PNG, "image/png")).status).toBe(404);
    expect(await ativos(avatar)).toBe(0);
    const { url } = await link();
    expect((await call(new Request(url))).status).toBe(405);
    // Fora do molde (outro tamanho, outra letra): não é o link de envio, e sem login não passa.
    for (const p of ["/envio/abc", `/envio/${"g".repeat(64)}`, `/envio/${"a".repeat(64)}/x`]) expect((await enviar(`${SITE}${p}`, PNG, "image/png")).status).not.toBe(201);
  });

  it("conta suspensa, sem a API ou avatar que mudou de dono: o link não vale", async () => {
    await memberCookie();
    const membro = (await env.DB.prepare("SELECT id FROM users WHERE email = 'membro@exemplo.com'").first<{ id: number }>())!.id;

    let l = await link();
    await env.DB.prepare("UPDATE avatars SET user_id = ? WHERE id = ?").bind(membro, l.avatar).run();
    expect((await enviar(l.url, PNG, "image/png")).status).toBe(404);

    // O ticket de uma conta sem a API (só por dentro: pela rota, ela nem pede o link).
    const avatar = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Dele" })).avatar.id;
    await env.DB.prepare("UPDATE avatars SET user_id = ? WHERE id = ?").bind(membro, avatar).run();
    const semApi = await criarEnvio(env.MIDIA, membro, avatar, "", "");
    expect((await enviar(`${SITE}/envio/${semApi.codigo}`, PNG, "image/png")).status).toBe(404);

    l = await link();
    await env.DB.prepare("UPDATE users SET permissoes = ? WHERE id = ?").bind(JSON.stringify(["suspensa"]), await admin()).run();
    expect((await enviar(l.url, PNG, "image/png")).status).toBe(404);
    await env.DB.prepare("UPDATE users SET permissoes = '[]' WHERE id = ?").bind(await admin()).run();
  });

  it("avatar de outra conta não se muda, não recebe arquivo nem gera link; conta sem a API não chega à rota", async () => {
    await memberCookie();
    const avatar = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Alheio" })).avatar.id;
    await env.DB.prepare("UPDATE avatars SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(avatar).run();
    for (const [name, args] of [
      ["editar_avatar", { avatar, nome: "Meu" }],
      ["enviar_ativo", { avatar }],
      ["enviar_ativo", { avatar, url: "https://arquivos.exemplo.com/touro.png" }],
    ] as const) {
      const r = await ferramenta(name, args);
      expect(r.isError, name).toBe(true);
      expect(r.content[0]!.text).toContain("nao_encontrado");
    }
    await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE email = 'membro@exemplo.com'").bind(crypto.randomUUID(), await sha256("ma_membro"), new Date().toISOString()).run();
    const antes = (await env.MIDIA.list({ prefix: "envios/" })).objects.length;
    const res = await call(new Request(`${SITE}/api/v1/avatares/${avatar}/envio`, { method: "POST", body: "{}", headers: { authorization: "Bearer ma_membro" } }));
    expect(res.status).toBe(404);
    expect((await env.MIDIA.list({ prefix: "envios/" })).objects).toHaveLength(antes);
  });
});

describe("pastas dos ativos pelo agente", () => {
  it("o ativo entra na pasta por url e pelo link, a pasta aparece nas listas e ele muda de pasta", async () => {
    const { avatar } = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Touro" }));
    const outro = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Urso" })).avatar.id;
    expect(dados<{ erro: string }>(await ferramenta("criar_pasta", { de: "avatar", nome: "Fotos" })).erro).toBe("nao_encontrado");
    const fotos = dados<{ pasta: { id: string; nome: string; avatar: { nome: string } } }>(await ferramenta("criar_pasta", { de: "avatar", avatar: avatar.id, nome: "Fotos" })).pasta;
    expect(fotos).toMatchObject({ nome: "Fotos", avatar: { nome: "Touro" } });
    const doOutro = dados<{ pasta: { id: string } }>(await ferramenta("criar_pasta", { de: "avatar", avatar: outro, nome: "Do Urso" })).pasta.id;

    // A pasta de outro avatar não serve; a certa guarda o ativo.
    expect(dados<{ erro: string }>(await ferramenta("enviar_ativo", { avatar: avatar.id, url: "https://arquivos.exemplo.com/touro.png", pasta: doOutro })).erro).toBe("pasta_inexistente");
    expect(dados<{ erro: string }>(await ferramenta("enviar_ativo", { avatar: avatar.id, pasta: doOutro })).erro).toBe("pasta_inexistente");
    const { ativo } = dados<{ ativo: Ativo & { pasta?: { id: string; nome: string } } }>(await ferramenta("enviar_ativo", { avatar: avatar.id, url: "https://arquivos.exemplo.com/touro.png", pasta: fotos.id }));
    expect(ativo.pasta).toEqual({ id: fotos.id, nome: "Fotos" });
    const { envio } = dados<Envio>(await ferramenta("enviar_ativo", { avatar: avatar.id, nome: "voz.mp3", tipo: "audio/mpeg", pasta: fotos.id }));
    const pelolink = ((await (await enviar(envio.url, MP3, "audio/mpeg")).json()) as { ativo: string }).ativo;
    expect(await env.DB.prepare("SELECT folder_id FROM avatar_assets WHERE id = ?").bind(pelolink).first()).toEqual({ folder_id: fotos.id });

    type Lista = { avatares: { id: string; pastas?: { nome: string }[]; ativos: { id: string; pasta?: { nome: string } }[] }[] };
    const touro = dados<Lista>(await ferramenta("listar_avatares", { busca: "Touro" })).avatares[0]!;
    expect(touro.pastas).toEqual([{ id: fotos.id, nome: "Fotos" }]);
    expect(touro.ativos.map((a) => a.pasta?.nome)).toEqual(["Fotos", "Fotos"]);
    expect(dados<{ arquivos: { id: string }[] }>(await ferramenta("listar_arquivos", { pasta: fotos.id })).arquivos.map((a) => a.id).sort()).toEqual([ativo.id, pelolink].sort());
    expect(dados<{ pastas: { nome: string; itens: number }[] }>(await ferramenta("listar_pastas", { de: "avatar", avatar: avatar.id })).pastas).toEqual([expect.objectContaining({ nome: "Fotos", itens: 2 })]);

    // Mover: só entre as pastas do mesmo avatar; sem pasta, volta para a lista.
    expect(dados<{ erro: string }>(await ferramenta("mover_para_pasta", { de: "avatar", avatar: avatar.id, itens: [ativo.id], pasta: doOutro })).erro).toBe("pasta_inexistente");
    expect(dados<{ erro: string }>(await ferramenta("mover_para_pasta", { de: "avatar", avatar: outro, itens: [ativo.id], pasta: doOutro })).erro).toBe("itens_inexistentes");
    expect(dados(await ferramenta("mover_para_pasta", { de: "avatar", avatar: avatar.id, itens: [ativo.id] }))).toMatchObject({ movidos: [ativo.id], pasta: null });
    expect(await env.DB.prepare("SELECT folder_id FROM avatar_assets WHERE id = ?").bind(ativo.id).first()).toEqual({ folder_id: null });
  });

  it("a pasta apagada depois do link não segura o envio: o ativo fica fora de pasta", async () => {
    const { avatar } = dados<{ avatar: { id: string } }>(await ferramenta("criar_avatar", { nome: "Touro" }));
    const pasta = dados<{ pasta: { id: string } }>(await ferramenta("criar_pasta", { de: "avatar", avatar: avatar.id, nome: "Some" })).pasta.id;
    const { envio } = dados<Envio>(await ferramenta("enviar_ativo", { avatar: avatar.id, pasta }));
    await env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(pasta).run();
    const res = await enviar(envio.url, PNG, "image/png");
    expect(res.status).toBe(201);
    expect(await env.DB.prepare("SELECT folder_id FROM avatar_assets WHERE id = ?").bind(((await res.json()) as { ativo: string }).ativo).first()).toEqual({ folder_id: null });
  });
});

describe("link de envio do projeto", () => {
  const WEBM = new TextEncoder().encode("webm-do-computador");
  const projeto = async (nome = "Campanha") => dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome }));
  const link = async (id: string, args: Record<string, unknown> = {}) => dados<Envio>(await ferramenta("enviar_arquivo", { projeto: id, ...args })).envio;
  const arquivos = async (id: string) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM project_files WHERE project_id = ?").bind(id).first<{ n: number }>())!.n;

  it("recebe o arquivo do computador, sem token, e ele entra no projeto com o adicionar", async () => {
    const { id, revisao } = await projeto();
    const envio = await link(id, { nome: "Depoimento.mp3", tipo: "audio/mpeg" });
    expect(envio.url).toMatch(new RegExp(`^${SITE}/envio/[0-9a-f]{64}$`));
    expect(envio.comando).toContain(envio.url);
    expect(envio.comando).toContain("content-type: audio/mpeg");
    expect(envio.comando).not.toContain("Bearer");
    expect(Date.parse(envio.expira) - Date.now()).toBeLessThanOrEqual(ENVIO_MS);

    const res = await enviar(envio.url, MP3, "audio/mpeg");
    expect(res.status).toBe(201);
    const guardado = (await res.json()) as { arquivo: string; projeto: string; src: string; usar: { arquivo: string } };
    expect(guardado).toMatchObject({ projeto: id, src: `/projetos/${id}/arquivos/${guardado.arquivo}`, usar: { arquivo: guardado.arquivo } });
    const lista = dados<{ arquivos: { id: string; nome: string; tipo: string }[] }>(await ferramenta("ver_projeto", { projeto: id, incluir: ["arquivos"] })).arquivos;
    expect(lista).toEqual([expect.objectContaining({ id: guardado.arquivo, nome: "Depoimento.mp3", tipo: "audio" })]);
    expect((await ferramenta("editar_projeto", { projeto: id, revisao, comandos: [{ tipo: "adicionar", ...guardado.usar, dur: 3 }] })).isError).toBeFalsy();
    // Um envio só: o mesmo link não serve de novo.
    expect((await enviar(envio.url, MP3, "audio/mpeg")).status).toBe(404);
    expect(await arquivos(id)).toBe(1);
  });

  it("vídeo diz se tem som; tipo fora da lista, vazio e grande demais são recusados, e o link some", async () => {
    const { id } = await projeto();
    const video = (await (await enviar((await link(id)).url, WEBM, "video/webm")).json()) as { som?: boolean | null };
    expect("som" in video).toBe(true);
    for (const [corpo, tipo, status, erro] of [
      ["<svg onload=alert(1)>", "image/svg+xml", 415, "tipo_invalido"],
      ["<html></html>", "text/html", 415, "tipo_invalido"],
      ["", "image/png", 400, "arquivo_vazio"],
    ] as const) {
      const { url } = await link(id);
      const res = await enviar(url, corpo, tipo);
      expect(res.status, tipo).toBe(status);
      expect(((await res.json()) as { erro: string }).erro).toBe(erro);
      expect((await enviar(url, PNG, "image/png")).status).toBe(404);
    }
    const { url } = await link(id);
    const grande = await enviar(url, PNG, "image/png", { "content-length": String(11 * 1024 * 1024) });
    expect(grande.status).toBe(413);
    expect(await arquivos(id)).toBe(1);
    // GET não envia nada.
    expect((await call(new Request((await link(id)).url))).status).toBe(405);
  });

  it("vencido, projeto apagado, de outra conta, conta suspensa ou sem a API: o link não vale", async () => {
    await memberCookie();
    const membro = (await env.DB.prepare("SELECT id FROM users WHERE email = 'membro@exemplo.com'").first<{ id: number }>())!.id;
    const { id } = await projeto();
    const vencido = await criarEnvio(env.MIDIA, await admin(), { projeto: id }, "", "", Date.now() - ENVIO_MS - 1000);
    expect((await enviar(`${SITE}/envio/${vencido.codigo}`, PNG, "image/png")).status).toBe(404);

    // O ticket de uma conta para o projeto de outra, e o de uma conta sem a API (só por dentro).
    const cruzado = await criarEnvio(env.MIDIA, membro, { projeto: id }, "", "");
    expect((await enviar(`${SITE}/envio/${cruzado.codigo}`, PNG, "image/png")).status).toBe(404);

    let l = await link(id);
    await env.DB.prepare("UPDATE projects SET user_id = ? WHERE id = ?").bind(membro, id).run();
    expect((await enviar(l.url, PNG, "image/png")).status).toBe(404);
    await env.DB.prepare("UPDATE projects SET user_id = ? WHERE id = ?").bind(await admin(), id).run();

    l = await link(id);
    await env.DB.prepare("UPDATE users SET permissoes = ? WHERE id = ?").bind(JSON.stringify(["suspensa"]), await admin()).run();
    expect((await enviar(l.url, PNG, "image/png")).status).toBe(404);
    await env.DB.prepare("UPDATE users SET permissoes = '[]' WHERE id = ?").bind(await admin()).run();

    l = await link(id);
    expect(dados<{ apagado: boolean }>(await ferramenta("apagar_projeto", { projeto: id, confirmar: true })).apagado).toBe(true);
    expect((await enviar(l.url, PNG, "image/png")).status).toBe(404);
    expect(await arquivos(id)).toBe(0);
    expect((await env.MIDIA.list({ prefix: `projetos/${id}/` })).objects).toHaveLength(0);
  });

  it("projeto de outra conta não gera link, e conta sem a API não chega à rota", async () => {
    await memberCookie();
    const { id } = await projeto("Alheio");
    await env.DB.prepare("UPDATE projects SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(id).run();
    const antes = (await env.MIDIA.list({ prefix: "envios/" })).objects.length;
    const r = await ferramenta("enviar_arquivo", { projeto: id });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("nao_encontrado");
    await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE email = 'membro@exemplo.com'").bind(crypto.randomUUID(), await sha256("ma_membro"), new Date().toISOString()).run();
    expect((await call(new Request(`${SITE}/api/v1/projetos/${id}/envio`, { method: "POST", body: "{}", headers: { authorization: "Bearer ma_membro" } }))).status).toBe(404);
    expect((await env.MIDIA.list({ prefix: "envios/" })).objects).toHaveLength(antes);
  });
});
