import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { call, cookie, FakeExportApi, FakeVideoApi, memberCookie, SITE } from "./helpers";

const VIDEO = "11111111-1111-4111-8111-111111111111";
const VIDEO2 = "33333333-3333-4333-8333-333333333333";
const OCULTO = "44444444-4444-4444-8444-444444444444";

/** Um token para a conta com este e-mail, direto no banco. */
async function token(email: string, code: string): Promise<string> {
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE email = ?")
    .bind(crypto.randomUUID(), await sha256(code), new Date().toISOString(), email)
    .run();
  return code;
}

const api = (path: string, code: string | null, body?: unknown, exporter = null as FakeExportApi | null) =>
  call(
    new Request(`${SITE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? null : JSON.stringify(body),
      headers: code ? { authorization: `Bearer ${code}` } : {},
    }),
    new FakeVideoApi(),
    null,
    null,
    exporter,
  );

async function video(id: string, structure = "wan", status = "completed") {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES (?, ?, 'Oi, gente, hoje vou mostrar meu produto', 'alibaba/wan-3.0', 10, '480p', '9:16', ?, ?, ?, ?)")
    .bind(id, status, `videos/${id}.mp4`, structure, now, now)
    .run();
}

let admin: string;
beforeEach(async () => {
  await cookie();
  const { email } = (await env.DB.prepare("SELECT email FROM users WHERE role = 'admin'").first<{ email: string }>())!;
  admin = await token(email, "ma_admin");
  await video(VIDEO);
  await video(VIDEO2);
});

async function novo(): Promise<{ id: string; revisao: number }> {
  const res = await api("/api/v1/projetos", admin, { nome: "Campanha" });
  expect(res.status).toBe(201);
  return res.json();
}
async function comandos(id: string, revisao: number, lista: unknown[]) {
  return api(`/api/v1/projetos/${id}/comandos`, admin, { revisao, comandos: lista });
}

describe("acesso à API", () => {
  it("sem token, com token errado ou com cookie de sessão: 401", async () => {
    const session = await cookie();
    expect((await api("/api/v1/projetos", null)).status).toBe(401);
    expect((await api("/api/v1/projetos", "ma_errado")).status).toBe(401);
    const res = await call(new Request(`${SITE}/api/v1/projetos`, { headers: { cookie: session } }));
    expect(res.status).toBe(401);
  });

  it("conta comum: 404, como o canvas", async () => {
    await memberCookie();
    const code = await token("membro@exemplo.com", "ma_membro");
    expect((await api("/api/v1/projetos", code)).status).toBe(404);
    expect((await api("/api/v1/videos", code)).status).toBe(404);
  });

  it("projeto de outra pessoa: 404 ao ler, editar e exportar", async () => {
    const { id } = await novo();
    await memberCookie();
    await env.DB.prepare("UPDATE projects SET user_id = (SELECT id FROM users WHERE email = 'membro@exemplo.com') WHERE id = ?").bind(id).run();
    const code = admin;
    expect((await api(`/api/v1/projetos/${id}`, code)).status).toBe(404);
    expect((await api(`/api/v1/projetos/${id}/comandos`, code, { revisao: 0, comandos: [{ tipo: "organizar" }] })).status).toBe(404);
    expect((await api(`/projetos/${id}/exportar`, code, { final: "final" })).status).toBe(404);
  });

  it("o token não abre o resto do site: nem páginas, nem apagar, nem salvar", async () => {
    const { id } = await novo();
    expect((await api("/", admin)).status).toBe(404);
    expect((await api("/videos", admin)).status).toBe(404);
    expect((await api(`/projetos/${id}/apagar`, admin, {})).status).toBe(404);
    expect((await api(`/projetos/${id}/salvar`, admin, { data: { blocks: [], finals: [], edges: [] } })).status).toBe(404);
    expect((await api("/sair", admin, {})).status).toBe(404);
    expect((await api(`/api/v1/projetos/${id}`, admin)).status).toBe(200);
  });
});

describe("leitura", () => {
  it("lista só os vídeos prontos que a conta pode usar", async () => {
    await video("22222222-2222-4222-8222-222222222222", "wan", "pending");
    const { videos } = await (await api("/api/v1/videos", admin)).json<{ videos: { id: string; src: string }[] }>();
    expect(videos.map((v) => v.id).sort()).toEqual([VIDEO, VIDEO2]);
    expect(videos[0]!.src).toMatch(/^\/videos\/.+\.mp4$/);
  });
});

describe("comandos", () => {
  it("monta 2 ganchos × 1 corpo e mostra as variações", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, nome: "Gancho 1", fim: 3 }, { tipo: "adicionar", video: VIDEO, nome: "Gancho 2", inicio: 3, fim: 6 }, { tipo: "adicionar", video: VIDEO2, nome: "Corpo" }])).json<{
      criados: string[];
      revisao: number;
      finais: { id: string }[];
    }>();
    const [g1, g2, corpo] = a.criados as [string, string, string];
    const res = await comandos(id, a.revisao, [{ tipo: "remover", ids: (await edges(id)) }, { tipo: "ligar", de: g1, para: corpo }, { tipo: "ligar", de: g2, para: corpo }, { tipo: "ligar", de: corpo, para: "final" }, { tipo: "final", id: "final", resolucao: "1080p", formato: "1:1" }]);
    expect(res.status).toBe(200);
    const fim = await res.json<{ finais: { resolucao: string; formato: string; variacoes: { nome: string; duracao: number }[] }[] }>();
    expect(fim.finais[0]).toMatchObject({ resolucao: "1080p", formato: "1:1" });
    expect(fim.finais[0]!.variacoes.map((v) => [v.nome, v.duracao])).toEqual([["Variação 1", 13], ["Variação 2", 13]]);
  });

  it("depois: cola na mesma sequência; sobre: cobre o grupo e soma o som", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4 }])).json<{ criados: string[]; revisao: number }>();
    const base = a.criados[0]!;
    const b = await (await comandos(id, a.revisao, [{ tipo: "adicionar", video: VIDEO2, fim: 2, depois: base }, { tipo: "adicionar", video: VIDEO2, inicio: 2, fim: 3, sobre: base, em: 1, semSom: true }])).json<{ grupos: { blocos: string[]; duracao: number }[]; criados: string[] }>();
    expect(b.grupos).toHaveLength(1);
    expect(b.grupos[0]!.duracao).toBe(6);
    expect(b.grupos[0]!.blocos).toEqual(expect.arrayContaining([base, ...b.criados]));
  });

  it("cortar segue as regras do modelo e recusa o que passa do arquivo", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }])).json<{ criados: string[]; revisao: number }>();
    const b = await comandos(id, a.revisao, [{ tipo: "cortar", bloco: a.criados[0], inicio: 2, fim: 5 }]);
    const fim = await b.json<{ revisao: number; canvas: { blocks: { tin: number; tout: number }[] } }>();
    expect(fim.canvas.blocks[0]).toMatchObject({ tin: 2, tout: 5 });
    const ruim = await comandos(id, fim.revisao, [{ tipo: "cortar", bloco: a.criados[0], fim: 99 }]);
    expect(ruim.status).toBe(400);
    expect(await ruim.json()).toEqual({ erro: "corte_invalido", comando: 0 });
  });

  it("recusa ligação repetida e em círculo, como a tela", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }, { tipo: "adicionar", video: VIDEO2 }])).json<{ criados: string[]; revisao: number }>();
    const [x, y] = a.criados as [string, string];
    const b = await (await comandos(id, a.revisao, [{ tipo: "ligar", de: x, para: y }])).json<{ revisao: number }>();
    expect(await (await comandos(id, b.revisao, [{ tipo: "ligar", de: x, para: y }])).json()).toEqual({ erro: "ligacao_repetida", comando: 0 });
    expect(await (await comandos(id, b.revisao, [{ tipo: "ligar", de: y, para: x }])).json()).toEqual({ erro: "ligacao_ciclo", comando: 0 });
  });

  it("um lote com erro não muda nada", async () => {
    const { id, revisao } = await novo();
    const res = await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }, { tipo: "nada" }]);
    expect(await res.json()).toEqual({ erro: "comando_desconhecido", comando: 1 });
    const salvo = await (await api(`/api/v1/projetos/${id}`, admin)).json<{ revisao: number; canvas: { blocks: unknown[] } }>();
    expect(salvo).toMatchObject({ revisao, canvas: { blocks: [] } });
  });

  it("vídeo que não existe ou arquivo de outro projeto não entra", async () => {
    const outro = await novo();
    const arquivo = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO project_files (id, project_id, key, name, type, size, created_at) VALUES (?, ?, 'x', 'x.mp4', 'video/mp4', 1, ?)").bind(arquivo, outro.id, new Date().toISOString()).run();
    const { id, revisao } = await novo();
    expect(await (await comandos(id, revisao, [{ tipo: "adicionar", video: OCULTO }])).json()).toEqual({ erro: "arquivo_indisponivel", comando: 0 });
    expect(await (await comandos(id, revisao, [{ tipo: "adicionar", arquivo, dur: 5 }])).json()).toEqual({ erro: "arquivo_indisponivel", comando: 0 });
  });

  it("revisão velha: 409 com a revisão atual, e nada é escrito", async () => {
    const { id, revisao } = await novo();
    await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }]);
    const res = await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO2 }]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ erro: "conflito", revisao: revisao + 1 });
  });
});

describe("a tela e a API no mesmo projeto", () => {
  const save = (id: string, session: string, body: unknown) => call(new Request(`${SITE}/projetos/${id}/salvar`, { method: "POST", body: JSON.stringify(body), headers: { origin: SITE, cookie: session } }));
  const data = { blocks: [], finals: [], edges: [] };

  it("salvar a partir de uma revisão velha dá 409; a certa devolve a nova", async () => {
    const session = await cookie();
    const { id, revisao } = await novo();
    const ok = await save(id, session, { data, revisao });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("x-revisao")).toBe(String(revisao + 1));
    expect((await save(id, session, { data, revisao })).status).toBe(409);
  });

  it("estado: sem mudança não traz o canvas; com mudança, traz a revisão nova", async () => {
    const session = await cookie();
    const { id, revisao } = await novo();
    const estado = (r: number) => call(new Request(`${SITE}/projetos/${id}/estado?revisao=${r}`, { headers: { cookie: session } }));
    expect((await estado(revisao)).status).toBe(204);
    await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }]);
    const res = await estado(revisao);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revisao: revisao + 1, data: { blocks: [{ kind: "video" }] } });
  });

  it("o token exporta pela mesma rota do site", async () => {
    const { id, revisao } = await novo();
    await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }]);
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const res = await api(`/projetos/${id}/exportar`, admin, { final: "final" }, new FakeExportApi());
    expect(res.status).toBe(201);
  });
});

/** As linhas do projeto, para os testes refazerem as ligações. */
async function edges(id: string): Promise<string[]> {
  const p = await (await api(`/api/v1/projetos/${id}`, admin)).json<{ canvas: { edges: { id: string }[] } }>();
  return p.canvas.edges.map((e) => e.id);
}
