import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { contentDisposition, downloadName } from "../src/arquivos";
import { call, cookie, memberCookie, mp3, postForm, SITE } from "./helpers";

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
    expect(arquivos[0]).toMatchObject({ nome: "foto produto.png", tipo: "imagem", fonte: "projeto", arquivo: "foto produto.png", mime: "image/png", tamanho: PNG.byteLength, baixar: `${SITE}${src}?baixar` });
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
    const asset = (await env.DB.prepare("SELECT id FROM avatar_assets WHERE avatar_id = ? AND kind = 'imagem'").bind(avatar).first<string>("id"))!;
    await env.DB.prepare("UPDATE avatar_assets SET name = 'Raposa - Character Sheet' WHERE id = ?").bind(asset).run();
    return { avatar, asset };
  }

  /** Um vídeo (ou imagem) gerado e pronto, com o arquivo no R2. */
  async function gerado(o: { structure: string; key: "mp4" | "png" | "mp3"; avatar?: string; nome?: string; prompt?: string; criado?: string }) {
    const id = crypto.randomUUID(), quando = o.criado ?? new Date().toISOString();
    const key = o.key === "png" ? `imagens/${id}.png` : o.key === "mp3" ? `audios/${id}.mp3` : `videos/${id}.mp4`;
    await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, avatar_id, name, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, 'completed', ?, 'm', 10, '480p', '9:16', ?, ?, ?, ?, ?, ?)")
      .bind(id, o.prompt ?? "Oi, gente", key, o.structure, o.avatar ?? null, o.nome ?? null, quando, quando)
      .run();
    const tipo = { png: "image/png", mp3: "audio/mpeg", mp4: "video/mp4" }[o.key];
    await env.MIDIA.put(key, o.key === "png" ? PNG : new Uint8Array([0, 0, 0, 8]), { httpMetadata: { contentType: tipo } });
    return id;
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

  it("o vídeo gerado da lista baixa com o token, com o nome e a extensão", async () => {
    await cookie();
    const { avatar } = await avatarComFoto(await cookie());
    const id = await gerado({ structure: "wan", key: "mp4", avatar, nome: "Gancho" });
    const { arquivos } = dados<{ arquivos: Record<string, unknown>[] }>(await ferramenta("listar_arquivos", { tipo: "video" }));
    expect(arquivos[0]).toMatchObject({ id, nome: "Gancho", tipo: "video", fonte: "gerado", modelo: { id: "wan" }, avatar: { id: avatar, nome: "Turma ANB" }, arquivo: "Gancho.mp4", mime: "video/mp4", baixar: `${SITE}/videos/${id}.mp4?baixar`, usar: { video: id } });
    const res = await baixar(`/videos/${id}.mp4?baixar`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(contentDisposition("Gancho.mp4"));
  });

  it("o áudio gerado da lista baixa com o token, pelo baixar que ela dá", async () => {
    await cookie();
    const id = await gerado({ structure: "elevenlabs", key: "mp3", nome: "Passo um" });
    const { arquivos } = dados<{ arquivos: Record<string, unknown>[] }>(await ferramenta("listar_arquivos", { tipo: "audio" }));
    expect(arquivos[0]).toMatchObject({ id, tipo: "audio", arquivo: "Passo um.mp3", baixar: `${SITE}/videos/${id}.mp3?baixar` });
    const res = await baixar(new URL(String(arquivos[0]!.baixar)).pathname + "?baixar");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(contentDisposition("Passo um.mp3"));
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

describe("listar_arquivos: o acervo numa lista só", () => {
  type Item = { id: string; tipo: string; fonte: string; criado: string; usar: Record<string, string>; [k: string]: unknown };
  const lista = async (args: Record<string, unknown> = {}) => dados<{ arquivos: Item[]; continuar?: string }>(await ferramenta("listar_arquivos", args));

  /** Um de cada: vídeo e imagem gerados, foto e áudio do avatar, arquivo enviado a um projeto. */
  async function acervo() {
    const session = await cookie();
    const res = await call(postForm("/avatares", { nome: "Turma ANB", imagem: new File([PNG], "raposa.png", { type: "image/png" }), voz: new File(["voz"], "voz.mp3", { type: "audio/mpeg" }) }, { cookie: session }));
    const avatar = res.headers.get("location")!.split("/").pop()!;
    const ids = async (kind: string) => (await env.DB.prepare("SELECT id FROM avatar_assets WHERE avatar_id = ? AND kind = ?").bind(avatar, kind).first<string>("id"))!;
    const ontem = (h: number) => new Date(Date.now() - 86_400_000 + h * 3_600_000).toISOString();
    const insere = async (structure: string, key: "mp4" | "png", criado: string, prompt: string) => {
      const id = crypto.randomUUID();
      const chave = key === "png" ? `imagens/${id}.png` : `videos/${id}.mp4`;
      await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, avatar_id, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, 'completed', ?, 'm', 8, '1K', '9:16', ?, ?, ?, ?, ?)").bind(id, prompt, chave, structure, structure === "wan" ? avatar : null, criado, criado).run();
      return id;
    };
    const video = await insere("wan", "mp4", ontem(1), "Fala do gancho");
    const imagem = await insere("nano-banana", "png", ontem(2), "Raposa na cozinha");
    const { id: projeto } = dados<{ id: string }>(await ferramenta("criar_projeto", { nome: "Campanha" }));
    const { src } = dados<{ src: string }>(await ferramenta("enviar_arquivo", { projeto, nome: "trilha.mp3", tipo: "audio/mpeg", base64: btoa("mp3") }));
    return { avatar, foto: await ids("imagem"), audio: await ids("audio"), video, imagem, projeto, enviado: src.split("/").pop()! };
  }

  it("traz as três fontes juntas, do mais novo ao mais antigo, com o mesmo item", async () => {
    const a = await acervo();
    const { arquivos } = await lista();
    expect(new Set(arquivos.map((x) => x.id))).toEqual(new Set([a.foto, a.audio, a.video, a.imagem, a.enviado]));
    expect(arquivos.map((x) => x.criado)).toEqual([...arquivos.map((x) => x.criado)].sort().reverse());
    for (const x of arquivos) expect(Object.keys(x)).toEqual(expect.arrayContaining(["id", "tipo", "fonte", "criado", "src", "arquivo", "mime", "baixar", "usar"]));
    const por = (id: string) => arquivos.find((x) => x.id === id)!;
    expect(por(a.imagem)).toMatchObject({ tipo: "imagem", fonte: "gerado", modelo: { id: "nano-banana" }, descricao: "Raposa na cozinha", mime: "image/png", usar: { imagem: a.imagem } });
    expect(por(a.video)).toMatchObject({ tipo: "video", fonte: "gerado", fala: "Fala do gancho", avatar: { id: a.avatar, nome: "Turma ANB" }, usar: { video: a.video } });
    expect(por(a.foto)).toMatchObject({ tipo: "imagem", fonte: "avatar", nome: "raposa.png", arquivo: "raposa.png", avatar: { nome: "Turma ANB" }, usar: { ativo: a.foto } });
    expect(por(a.audio)).toMatchObject({ tipo: "audio", fonte: "avatar", arquivo: "voz.mp3", mime: "audio/mpeg" });
    expect(por(a.enviado)).toMatchObject({ tipo: "audio", fonte: "projeto", projeto: { id: a.projeto, nome: "Campanha" }, arquivo: "trilha.mp3", usar: { arquivo: a.enviado } });
  });

  it("o áudio de um modelo de fala é gerado do tipo audio e entra no projeto com adicionar {audio}", async () => {
    await cookie();
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, 'completed', 'Olha a diferença', 'elevenlabs/eleven-v4', 3, '', '', ?, 'elevenlabs', ?, ?)")
      .bind(id, `audios/${id}.mp3`, new Date().toISOString(), new Date().toISOString())
      .run();
    const { arquivos } = await lista({ tipo: "audio", fonte: "gerado" });
    expect(arquivos).toHaveLength(1);
    expect(arquivos[0]).toMatchObject({ id, tipo: "audio", fonte: "gerado", modelo: { id: "elevenlabs" }, src: `/videos/${id}.mp3`, mime: "audio/mpeg", usar: { audio: id } });
    const { id: projeto, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Narração" }));
    const editado = await ferramenta("editar_projeto", { projeto, revisao, comandos: [{ tipo: "adicionar", audio: id }] });
    expect(editado.isError).toBeFalsy();
    const visto = dados<{ grupos: { blocos: { tipo: string; dur?: number }[] }[] }>(await ferramenta("ver_projeto", { projeto }));
    expect(visto.grupos.flatMap((g) => g.blocos).some((b) => b.tipo === "audio")).toBe(true);
  });

  it("a fala entra com a duração do MP3 (a guardada é em segundos inteiros) e o nome sem as emoções", async () => {
    await cookie();
    const id = crypto.randomUUID();
    await env.MIDIA.put(`audios/${id}.mp3`, mp3(2.5));
    await env.DB.prepare("INSERT INTO videos (user_id, id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES ((SELECT id FROM users WHERE role = 'admin'), ?, 'completed', '[serious] Aí o banco fecha', 'fish', 3, '', '', ?, 'fish', ?, ?)")
      .bind(id, `audios/${id}.mp3`, new Date().toISOString(), new Date().toISOString())
      .run();
    const { id: projeto, revisao } = dados<{ id: string; revisao: number }>(await ferramenta("criar_projeto", { nome: "Narração" }));
    await ferramenta("editar_projeto", { projeto, revisao, comandos: [{ tipo: "adicionar", audio: id }] });
    const visto = dados<{ grupos: { duracao: number; blocos: { nome: string }[] }[] }>(await ferramenta("ver_projeto", { projeto }));
    expect(visto.grupos[0]).toMatchObject({ duracao: 2.5, blocos: [{ nome: "Aí o banco fecha" }] });
  });

  it("filtra por tipo, fonte, modelo, avatar, projeto e busca", async () => {
    const a = await acervo();
    const ids = async (args: Record<string, unknown>) => new Set((await lista(args)).arquivos.map((x) => x.id));
    expect(await ids({ tipo: "imagem" })).toEqual(new Set([a.foto, a.imagem]));
    expect(await ids({ tipo: "audio" })).toEqual(new Set([a.audio, a.enviado]));
    expect(await ids({ tipo: "video" })).toEqual(new Set([a.video]));
    expect(await ids({ fonte: "gerado" })).toEqual(new Set([a.video, a.imagem]));
    expect(await ids({ fonte: "avatar" })).toEqual(new Set([a.foto, a.audio]));
    expect(await ids({ fonte: "projeto" })).toEqual(new Set([a.enviado]));
    expect(await ids({ modelo: "nano-banana" })).toEqual(new Set([a.imagem]));
    expect(await ids({ avatar: a.avatar })).toEqual(new Set([a.foto, a.audio, a.video]));
    expect(await ids({ projeto: a.projeto })).toEqual(new Set([a.enviado]));
    expect(await ids({ busca: "raposa" })).toEqual(new Set([a.foto, a.imagem]));
    expect(await ids({ tipo: "audio", fonte: "gerado" })).toEqual(new Set());
  });

  it("a página passa de uma fonte para outra sem repetir nem pular", async () => {
    await acervo();
    const vistos: string[] = [];
    let r = await lista({ limite: 2 });
    for (let i = 0; i < 5; i++) {
      vistos.push(...r.arquivos.map((x) => x.id));
      if (!r.continuar) break;
      r = await lista({ limite: 2, continuar: r.continuar });
    }
    expect(vistos).toHaveLength(5);
    expect(new Set(vistos).size).toBe(5);
  });

  it("o de outra conta não aparece", async () => {
    await acervo();
    const membro = await memberCookie();
    await call(postForm("/avatares", { nome: "Dela", imagem: new File([PNG], "dela.png", { type: "image/png" }) }, { cookie: membro }));
    expect((await lista()).arquivos.some((x) => x.nome === "dela.png")).toBe(false);
  });
});
