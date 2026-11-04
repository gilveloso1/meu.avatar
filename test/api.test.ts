import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { sugestao, TIPOS } from "../src/comandos";
import { normalizar } from "../src/transcricao";
import { ERROS } from "../src/erros";
import { call, cookie, FakeExportApi, FakeRenderApi, FakeTranscriber, FakeVideoApi, memberCookie, SITE } from "./helpers";

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

const api = (path: string, code: string | null, body?: unknown, exporter = null as FakeExportApi | null, transcriber = null as FakeTranscriber | null, renderer = null as FakeRenderApi | null) =>
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
    transcriber,
    renderer,
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
/** O lote e, para os testes conferirem o canvas, o projeto lido logo depois (a resposta dos comandos é só o resumo). */
async function comandos(id: string, revisao: number, lista: unknown[], exporter: FakeExportApi | null = null) {
  const res = await api(`/api/v1/projetos/${id}/comandos`, admin, { revisao, comandos: lista }, exporter);
  if (!res.ok) return res;
  const resposta = await res.json<Record<string, unknown>>();
  const salvo = await (await api(`/api/v1/projetos/${id}?incluir=arquivos,canvas`, admin)).json<Record<string, unknown>>();
  return Response.json({ ...salvo, ...resposta });
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

describe("listar vídeos", () => {
  type Lista = { videos: { id: string; criado: string }[]; continuar?: string };
  const lista = async (q = "") => (await api(`/api/v1/videos${q}`, admin)).json<Lista>();
  /** Cinco vídeos prontos, um por dia, de 1 a 5 de outubro (os do beforeEach são de hoje). */
  async function porDia() {
    for (let d = 1; d <= 5; d++) {
      const quando = `2026-10-0${d}T12:00:00.000Z`;
      await env.DB.prepare("INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES (?, 'completed', ?, 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)")
        .bind(`dia-${d}`, `Fala do dia ${d}`, `videos/dia-${d}.mp4`, quando, quando)
        .run();
    }
  }

  it("página por página, do mais novo ao mais antigo, sem repetir nem pular", async () => {
    await porDia();
    const vistos: string[] = [];
    let r = await lista("?limite=3");
    for (let i = 0; i < 5 && r; i++) {
      vistos.push(...r.videos.map((v) => v.id));
      r = r.continuar ? await lista(`?limite=3&continuar=${encodeURIComponent(r.continuar)}`) : (null as unknown as Lista);
    }
    expect(vistos.slice(2)).toEqual(["dia-5", "dia-4", "dia-3", "dia-2", "dia-1"]);
    expect(new Set(vistos).size).toBe(7);
    expect((await lista()).continuar).toBeUndefined();
  });

  it("desde e ate pela data, com o dia do ate inteiro", async () => {
    await porDia();
    expect((await lista("?desde=2026-10-02&ate=2026-10-04")).videos.map((v) => v.id)).toEqual(["dia-4", "dia-3", "dia-2"]);
    expect((await lista("?ate=2026-10-01")).videos.map((v) => v.id)).toEqual(["dia-1"]);
  });

  it("recusa limite, data e continuar errados", async () => {
    for (const [q, erro] of [["?limite=0", "limite_invalido"], ["?limite=101", "limite_invalido"], ["?desde=ontem", "data_invalida"], ["?continuar=x", "continuar_invalido"]]) {
      const res = await api(`/api/v1/videos${q}`, admin);
      expect([res.status, await res.json()]).toEqual([400, { erro }]);
    }
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
    const b = await (await comandos(id, a.revisao, [{ tipo: "adicionar", video: VIDEO2, fim: 2, depois: base }, { tipo: "adicionar", video: VIDEO2, inicio: 2, fim: 3, sobre: base, em: 1, semSom: true }])).json<{ grupos: { blocos: { id: string }[]; duracao: number }[]; criados: string[] }>();
    expect(b.grupos).toHaveLength(1);
    expect(b.grupos[0]!.duracao).toBe(6);
    expect(b.grupos[0]!.blocos.map((o) => o.id)).toEqual(expect.arrayContaining([base, ...b.criados]));
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

  it("ver o projeto: os blocos com início e fim no grupo; arquivos e canvas só pedidos", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4 }])).json<{ revisao: number; criados: string[] }>();
    const base = a.criados[0]!;
    const b = await (await comandos(id, a.revisao, [{ tipo: "rascunho", fala: "Depois", duracao: 2, depois: base }, { tipo: "adicionar", video: VIDEO2, inicio: 2, fim: 3, sobre: base, em: 1, semSom: true }])).json<{ criados: string[] }>();
    const [texto, cobre] = b.criados;
    const enxuto = await (await api(`/api/v1/projetos/${id}`, admin)).json<Record<string, unknown> & { grupos: { blocos: unknown[] }[] }>();
    expect(enxuto).not.toHaveProperty("canvas");
    expect(enxuto).not.toHaveProperty("arquivos");
    expect(enxuto.grupos[0]!.blocos).toEqual([
      expect.objectContaining({ id: base, tipo: "video", camada: "base", inicio: 0, fim: 4 }),
      expect.objectContaining({ id: texto, tipo: "rascunho", camada: "base", inicio: 4, fim: 6 }),
      expect.objectContaining({ id: cobre, tipo: "video", camada: "cobertura", inicio: 1, fim: 2 }),
    ]);
    const tudo = await (await api(`/api/v1/projetos/${id}?incluir=arquivos,canvas`, admin)).json<Record<string, unknown>>();
    expect(tudo).toHaveProperty("canvas");
    expect(tudo).toHaveProperty("arquivos");
  });

  it("limpar arquivos espera a exportação acabar", async () => {
    const { id } = await novo();
    const agora = new Date().toISOString();
    await env.DB.prepare("INSERT INTO exports (id, project_id, total, plan, created_at, expires_at) VALUES ('e1', ?, 1, '{}', ?, ?)").bind(id, agora, agora).run();
    expect((await api(`/api/v1/projetos/${id}/limpar`, admin, {})).status).toBe(200);
    const res = await api(`/api/v1/projetos/${id}/limpar`, admin, { apagar: true });
    expect([res.status, await res.json()]).toEqual([409, { erro: "exportando" }]);
  });

  it("a resposta é o resumo: sem os arquivos e o canvas inteiro", async () => {
    const { id, revisao } = await novo();
    const res = await api(`/api/v1/projetos/${id}/comandos`, admin, { revisao, comandos: [{ tipo: "rascunho", fala: "Oi, gente", duracao: 2 }] });
    const r = await res.json<Record<string, unknown>>();
    expect(Object.keys(r).sort()).toEqual(["avisos", "criados", "finais", "grupos", "revisao"]);
    expect(r).toMatchObject({ revisao: revisao + 1, avisos: [{ tipo: "rascunho", fala: "Oi, gente" }] });
  });

  it("um lote com erro não muda nada", async () => {
    const { id, revisao } = await novo();
    const res = await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }, { tipo: "nada" }]);
    expect(await res.json()).toEqual({ erro: "comando_desconhecido", comando: 1, tipos: TIPOS });
    const salvo = await (await api(`/api/v1/projetos/${id}?incluir=arquivos,canvas`, admin)).json<{ revisao: number; canvas: { blocks: unknown[] } }>();
    expect(salvo).toMatchObject({ revisao, canvas: { blocks: [] } });
  });

  it("comando com o nome quase certo sugere o certo", async () => {
    const { id, revisao } = await novo();
    expect(await (await comandos(id, revisao, [{ tipo: "troca", bloco: "x" }])).json()).toEqual({ erro: "comando_desconhecido", comando: 0, sugestao: "trocar" });
    expect(sugestao("remover_pausas")).toBe("removerPausas");
    expect(sugestao("Cortar")).toBe("cortar");
    expect(sugestao("remove")).toBe("remover");
    expect(sugestao("legendar")).toBeNull();
    expect(sugestao(undefined)).toBeNull();
  });

  it("todo tipo da lista tem o seu caso", async () => {
    const { id, revisao } = await novo();
    for (const tipo of TIPOS) {
      const r = await (await comandos(id, revisao, [{ tipo }])).json<{ erro?: string }>();
      expect(r.erro, tipo).not.toBe("comando_desconhecido");
    }
  });

  it("vídeo que não existe ou arquivo de outro projeto não entra", async () => {
    const outro = await novo();
    const arquivo = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO project_files (id, project_id, key, name, type, size, created_at) VALUES (?, ?, 'x', 'x.mp4', 'video/mp4', 1, ?)").bind(arquivo, outro.id, new Date().toISOString()).run();
    const { id, revisao } = await novo();
    expect(await (await comandos(id, revisao, [{ tipo: "adicionar", video: OCULTO }])).json()).toEqual({ erro: "arquivo_indisponivel", comando: 0 });
    expect(await (await comandos(id, revisao, [{ tipo: "adicionar", arquivo, dur: 5 }])).json()).toEqual({ erro: "arquivo_indisponivel", comando: 0 });
  });

  it("revisão velha: 409 com o projeto como está agora, e nada é escrito", async () => {
    const { id, revisao } = await novo();
    const feito = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }])).json<{ criados: string[] }>();
    const res = await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO2 }]);
    expect(res.status).toBe(409);
    const r = await res.json<Record<string, unknown>>();
    expect(Object.keys(r).sort()).toEqual(["avisos", "erro", "finais", "grupos", "revisao"]);
    expect(r).toMatchObject({ erro: "conflito", revisao: revisao + 1, grupos: [{ blocos: [{ id: feito.criados[0] }] }] });
  });
});

describe("edição fina", () => {
  type Bloco = { id: string; x: number; y: number; tin: number; tout: number; speed?: number; frame?: Record<string, unknown> };
  type Vista = { revisao: number; criados: string[]; grupos: { blocos: { id: string }[]; duracao: number }[]; finais: { variacoes: { duracao: number }[] }[]; canvas: { blocks: Bloco[]; finals: { speed?: number }[] } };
  const lote = async (id: string, revisao: number, lista: unknown[]) => (await comandos(id, revisao, lista)).json<Vista>();
  const bloco = (v: Vista, id: string) => v.canvas.blocks.find((b) => b.id === id)!;

  /** Um projeto com A (4 s) e B (2 s) em sequência. */
  async function dois() {
    const { id, revisao } = await novo();
    const a = await lote(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4 }]);
    const v = await lote(id, a.revisao, [{ tipo: "adicionar", video: VIDEO2, fim: 2, depois: a.criados[0] }]);
    return { id, a: a.criados[0]!, b: v.criados[0]!, v };
  }

  it("dividir: dois blocos encostados, que somam o mesmo tempo", async () => {
    const { id, a, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "dividir", bloco: a, em: 1.5 }]);
    expect(r.grupos[0]!.duracao).toBe(6);
    expect(bloco(r, a).tout).toBe(1.5);
    expect(bloco(r, r.criados[0]!)).toMatchObject({ tin: 1.5, tout: 4, x: 60 });
  });

  it("dividir longe demais de uma ponta é recusado", async () => {
    const { id, a, v } = await dois();
    expect(await (await comandos(id, v.revisao, [{ tipo: "dividir", bloco: a, em: 0.1 }])).json()).toEqual({ erro: "corte_invalido", comando: 0 });
  });

  it("inserir no meio empurra quem vem depois", async () => {
    const { id, a, b, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "adicionar", video: VIDEO2, fim: 1, depois: a }]);
    expect(bloco(r, r.criados[0]!).x).toBe(160);
    expect(bloco(r, b).x).toBe(200);
    expect(r.grupos[0]!.duracao).toBe(7);
  });

  it("mover troca a ordem sem buraco, e a cobertura vai junto", async () => {
    const { id, a, b, v } = await dois();
    const c = await lote(id, v.revisao, [{ tipo: "adicionar", video: VIDEO2, fim: 1, sobre: a, em: 1, semSom: true }]);
    const r = await lote(id, c.revisao, [{ tipo: "mover", bloco: b, antes: a }]);
    expect(bloco(r, b).x).toBe(0);
    expect(bloco(r, a).x).toBe(80);
    expect(bloco(r, c.criados[0]!).x).toBe(120);
  });

  it("cortar puxa quem vem depois, sem abrir buraco", async () => {
    const { id, a, b, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "cortar", bloco: a, inicio: 1, fim: 3 }]);
    expect(bloco(r, b).x).toBe(80);
    expect(r.grupos[0]!.duracao).toBe(4);
  });

  it("remover com fechar encosta o resto", async () => {
    const { id, a, b, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "remover", ids: [a], fechar: true }]);
    expect(bloco(r, b).x).toBe(0);
  });

  it("velocidade do bloco encurta o tempo e empurra a sequência", async () => {
    const { id, a, b, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "velocidade", bloco: a, velocidade: 2 }]);
    expect(bloco(r, a).speed).toBe(2);
    expect(bloco(r, b).x).toBe(80);
    expect(r.grupos[0]!.duracao).toBe(4);
    expect(await (await comandos(id, r.revisao, [{ tipo: "velocidade", bloco: a, velocidade: 9 }])).json()).toEqual({ erro: "velocidade_invalida", comando: 0 });
  });

  it("velocidade do Final vale para a duração das variações", async () => {
    const { id, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "final", id: "final", velocidade: 1.5 }]);
    expect(r.canvas.finals[0]!.speed).toBe(1.5);
    expect(r.finais[0]!.variacoes[0]!.duracao).toBe(4);
  });

  it("enquadrar guarda zoom, recorte e animação, e recusa fora da faixa", async () => {
    const { id, a, v } = await dois();
    const r = await lote(id, v.revisao, [{ tipo: "enquadrar", bloco: a, encaixe: "desfocar", girar: 90, espelharH: true, recorte: { topo: 0.1 }, chaves: [{ t: 0, zoom: 1 }, { t: 2, zoom: 1.5, focoY: 0.3 }] }]);
    expect(bloco(r, a).frame).toEqual({ fit: "blur", rotate: 90, flipH: true, crop: { l: 0, t: 0.1, r: 0, b: 0 }, keys: [{ t: 0, z: 1, x: 0.5, y: 0.5 }, { t: 2, z: 1.5, x: 0.5, y: 0.3 }] });
    expect(await (await comandos(id, r.revisao, [{ tipo: "enquadrar", bloco: a, zoom: 0.5 }])).json()).toEqual({ erro: "enquadramento_invalido", comando: 0 });
  });

  it("zoom no rosto usa o ponto achado; sem ele, recusa", async () => {
    const { id, a, v } = await dois();
    expect(await (await comandos(id, v.revisao, [{ tipo: "enquadrar", bloco: a, zoom: 1.4, rosto: true }])).json()).toEqual({ erro: "rosto_indisponivel", comando: 0 });
    await env.DB.prepare("UPDATE videos SET face = ? WHERE id = ?").bind('{"x":0.4,"y":0.2}', VIDEO).run();
    const r = await lote(id, v.revisao, [{ tipo: "enquadrar", bloco: a, zoom: 1.4, rosto: true }]);
    expect(bloco(r, a).frame!.keys).toEqual([{ t: 0, z: 1.4, x: 0.4, y: 0.2 }]);
  });

  it("remover pausas tira o silêncio do meio e mantém a sequência encostada", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    const fake = new FakeExportApi();
    fake.silences = { duracao: 10, silencios: [[3, 5]], som: true };
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }], fake)).json<Vista>();
    const r = await (await comandos(id, a.revisao, [{ tipo: "removerPausas", bloco: a.criados[0], pausa: "curta" }], fake)).json<Vista>();
    expect(r.canvas.blocks).toHaveLength(2);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.duracao).toBeLessThan(9);
  });

  it("avisa quando a cobertura passa do fim do vídeo de base", async () => {
    const { id, a, v } = await dois();
    const c = await lote(id, v.revisao, [{ tipo: "adicionar", video: VIDEO2, fim: 6, sobre: a, em: 0, semSom: true }]);
    expect((c as unknown as { avisos: unknown[] }).avisos).toEqual([]);
    const r = await (await comandos(id, c.revisao, [{ tipo: "velocidade", bloco: a, velocidade: 2 }])).json<{ avisos: unknown[] }>();
    expect(r.avisos).toEqual([{ tipo: "sem_video_de_base", grupo: a, de: 4, ate: 6, segundos: 2 }]);
    const lido = await (await api(`/api/v1/projetos/${id}`, admin)).json<{ avisos: unknown[] }>();
    expect(lido.avisos).toEqual(r.avisos);
  });

  it("grupos soltos com cobertura e som não se misturam", async () => {
    const { id, revisao } = await novo();
    const arquivo = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO project_files (id, project_id, key, name, type, size, created_at) VALUES (?, ?, 'x', 'm.m4a', 'audio/mp4', 1, ?)").bind(arquivo, id, new Date().toISOString()).run();
    const cmd: unknown[] = [];
    for (const n of ["a", "b", "c"]) {
      cmd.push({ tipo: "adicionar", video: VIDEO, fim: 3, rotulo: n });
      cmd.push({ tipo: "adicionar", video: VIDEO2, fim: 3, sobre: `@${n}`, em: 0, semSom: true });
      cmd.push({ tipo: "adicionar", arquivo, dur: 9, fim: 3, sobre: `@${n}`, em: 0 });
    }
    const r = await (await comandos(id, revisao, cmd)).json<{ grupos: { blocos: { id: string }[]; duracao: number }[]; avisos: unknown[] }>();
    expect(r.grupos.map((g) => [g.blocos.length, g.duracao])).toEqual([[3, 3], [3, 3], [3, 3]]);
    expect(r.avisos).toEqual([]);
  });

  it("rotulo: um comando cita o bloco criado antes no mesmo lote", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [
      { tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" },
      { tipo: "adicionar", video: VIDEO2, fim: 2, depois: "@a", rotulo: "b" },
      { tipo: "dividir", bloco: "@a", em: 2, rotulo: "a2" },
      { tipo: "cortar", bloco: "@a2", fim: 3 },
      { tipo: "velocidade", bloco: "@b", velocidade: 2 },
    ]);
    expect(r.criados).toHaveLength(3);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.duracao).toBe(4);
    expect(await (await comandos(id, r.revisao, [{ tipo: "cortar", bloco: "@nada", fim: 1 }])).json()).toEqual({ erro: "rotulo_desconhecido", comando: 0 });
  });

  it("o agente vê o vídeo exportado, e só o do próprio projeto", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    const outro = await novo();
    await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }]);
    const fake = new FakeExportApi();
    let e = await (await api(`/projetos/${id}/exportar`, admin, { final: "final" }, fake)).json<{ id: string; status: string; versoes: { href: string }[] }>();
    for (let i = 0; i < 5 && e.status !== "done"; i++) e = await (await api(`/projetos/${id}/exportacoes/${e.id}`, admin, {}, fake)).json();
    const href = e.versoes[0]!.href;
    const q = await api(`/api/v1/projetos/${id}/quadros?src=${href}&instantes=1`, admin, undefined, fake);
    expect(q.status).toBe(200);
    await q.arrayBuffer();
    expect((await api(`/api/v1/projetos/${outro.id}/quadros?src=${href}&instantes=1`, admin, undefined, fake)).status).toBe(404);
    expect((await api(`/api/v1/projetos/${id}/quadros?src=/projetos/${id}/exportacoes/${crypto.randomUUID()}/0.mp4&instantes=1`, admin, undefined, fake)).status).toBe(404);
  });

  it("quadros e silêncios só de arquivo que a conta pode usar", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id } = await novo();
    const fake = new FakeExportApi();
    const q = await api(`/api/v1/projetos/${id}/quadros?src=/videos/${VIDEO}.mp4&instantes=1,2`, admin, undefined, fake);
    expect(q.status).toBe(200);
    expect(q.headers.get("content-type")).toBe("image/jpeg");
    await q.arrayBuffer();
    expect(await (await api(`/api/v1/projetos/${id}/silencios?src=/videos/${VIDEO}.mp4`, admin, undefined, fake)).json()).toEqual(fake.silences);
    expect((await api(`/api/v1/projetos/${id}/quadros?src=/videos/${OCULTO}.mp4&instantes=1`, admin, undefined, fake)).status).toBe(404);
    expect((await api(`/api/v1/projetos/${id}/quadros?src=/videos/${VIDEO}.mp4&instantes=x`, admin, undefined, fake)).status).toBe(400);
  });

  it("remover pausas num arquivo sem som não corta nada", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    const fake = new FakeExportApi();
    fake.silences = { duracao: 10, silencios: [], som: false };
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO }], fake)).json<{ revisao: number; criados: string[] }>();
    const r = await comandos(id, a.revisao, [{ tipo: "removerPausas", bloco: a.criados[0], pausa: "curta" }], fake);
    expect(r.status).toBe(200);
    expect((await r.json<{ canvas: { blocks: unknown[] } }>()).canvas.blocks).toHaveLength(1);
    expect(await (await api(`/api/v1/projetos/${id}/silencios?src=/videos/${VIDEO}.mp4`, admin, undefined, fake)).json()).toEqual({ duracao: 10, silencios: [], som: false });
  });

  it("contêiner que não responde é um erro com código, não uma queda", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id } = await novo();
    const fake = new FakeExportApi();
    fake.fail = "The container service is unreachable, try again later";
    for (const rota of [`quadros?src=/videos/${VIDEO}.mp4&instantes=1`, `silencios?src=/videos/${VIDEO}.mp4`]) {
      const res = await api(`/api/v1/projetos/${id}/${rota}`, admin, undefined, fake);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ erro: "conteiner_falhou" });
    }
  });
});

describe("transcrição", () => {
  type Vista = { revisao: number; criados: string[]; grupos: { duracao: number }[]; canvas: { blocks: { id: string; tin: number; tout: number }[] } };
  const fala = (id: string, src: string, t: FakeTranscriber | null, e: FakeExportApi | null = new FakeExportApi()) => api(`/api/v1/projetos/${id}/transcricao?src=${src}`, admin, undefined, e, t);

  it("devolve as palavras com os tempos e não paga de novo pelo mesmo arquivo", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id } = await novo();
    const t = new FakeTranscriber();
    const res = await fala(id, `/videos/${VIDEO}.mp4`, t);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(t.result);
    expect(t.calls).toEqual(["mp3"]);
    await (await fala(id, `/videos/${VIDEO}.mp4`, t)).arrayBuffer();
    expect(t.calls).toHaveLength(1);
    // Arquivo trocado (áudio tratado de novo): outro etag, transcreve de novo.
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([4, 5, 6, 7]));
    await (await fala(id, `/videos/${VIDEO}.mp4`, t)).arrayBuffer();
    expect(t.calls).toHaveLength(2);
  });

  it("sem o Whisper ou sem o contêiner, avisa; arquivo que a conta não usa, não existe", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id } = await novo();
    expect(await (await fala(id, `/videos/${VIDEO}.mp4`, null)).json()).toEqual({ erro: "transcricao_indisponivel" });
    expect((await fala(id, `/videos/${VIDEO}.mp4`, new FakeTranscriber(), null)).status).toBe(503);
    expect((await fala(id, `/videos/${OCULTO}.mp4`, new FakeTranscriber())).status).toBe(404);
  });

  it("normaliza a resposta do Whisper: palavras sem espaço e tempos em centésimos", () => {
    const out = normalizar({
      text: " Oi gente",
      transcription_info: { language: "pt", duration: 2.0004 },
      segments: [{ words: [{ word: " Oi", start: 0.123, end: 0.456 }] }, { words: [{ word: " gente", start: 0.5, end: 0.9 }, { word: " ", start: 1, end: 1.1 }] }],
    });
    expect(out).toEqual({ idioma: "pt", duracao: 2, texto: "Oi gente", palavras: [{ palavra: "Oi", inicio: 0.12, fim: 0.46 }, { palavra: "gente", inicio: 0.5, fim: 0.9 }] });
    expect(normalizar({ words: [{ word: "Oi", start: 0, end: 0.3 }] }).texto).toBe("Oi");
  });

  it("removerTrechos tira o vício do meio e o resto encosta", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 6 }])).json<Vista>();
    const r = await (await comandos(id, a.revisao, [{ tipo: "removerTrechos", bloco: a.criados[0], trechos: [[1.6, 2.5], [5.5, 9]] }])).json<Vista>();
    expect(r.canvas.blocks.map((b) => [b.tin, b.tout])).toEqual([[0, 1.6], [2.5, 5.5]]);
    expect(r.criados).toHaveLength(1);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.duracao).toBeCloseTo(4.6);
  });

  it("removerTrechos recusa sobra curta e trecho fora do bloco", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 6 }])).json<Vista>();
    const pede = async (trechos: unknown) => (await comandos(id, a.revisao, [{ tipo: "removerTrechos", bloco: a.criados[0], trechos }])).json();
    expect(await pede([[0.2, 3]])).toEqual({ erro: "sobra_curta", comando: 0 });
    expect(await pede([[0, 6]])).toEqual({ erro: "sobra_curta", comando: 0 });
    expect(await pede([[7, 8]])).toEqual({ erro: "trechos_invalidos", comando: 0 });
    expect(await pede([[2, 1]])).toEqual({ erro: "trechos_invalidos", comando: 0 });
    expect(await pede([])).toEqual({ erro: "trechos_invalidos", comando: 0 });
  });
});

describe("ativos de avatar", () => {
  type Vista = { revisao: number; criados: string[]; canvas: { blocks: { id: string; kind: string; src: string; dur: number; tout: number; frame?: { keys?: { x: number; y: number }[] } }[] } };
  const AVATAR = "55555555-5555-4555-8555-555555555555";
  const ALHEIO = "66666666-6666-4666-8666-666666666666";
  const FOTO = "77777777-7777-4777-8777-777777777777";
  const ENVIADO = "88888888-8888-4888-8888-888888888888";
  const GERADO = "99999999-9999-4999-8999-999999999999";
  const DE_OUTRO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  async function avatar(id: string, userId: number, nome: string, foto: string | null = null) {
    const agora = new Date().toISOString();
    await env.DB.prepare("INSERT INTO avatars (id, user_id, name, photo_asset, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, nome, foto, agora, agora).run();
  }
  async function ativo(id: string, avatarId: string, kind: string, type: string, sourceVideo: string | null = null, face: string | null = null) {
    await env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, source_video, face, created_at) VALUES (?, ?, ?, ?, ?, ?, 3, ?, ?, ?)")
      .bind(id, avatarId, kind, `avatares-ativos/${avatarId}/${id}`, `${kind}-${id.slice(0, 4)}`, type, sourceVideo, face, new Date().toISOString())
      .run();
  }

  beforeEach(async () => {
    const { id: adminId } = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!;
    await memberCookie();
    const { id: membroId } = (await env.DB.prepare("SELECT id FROM users WHERE role = 'member'").first<{ id: number }>())!;
    await avatar(AVATAR, adminId, "Marina", FOTO);
    await avatar(ALHEIO, membroId, "Outro");
    await ativo(FOTO, AVATAR, "imagem", "image/jpeg", null, JSON.stringify({ x: 0.4, y: 0.3 }));
    await ativo(ENVIADO, AVATAR, "video", "video/mp4");
    await ativo(GERADO, AVATAR, "video", "video/mp4", VIDEO);
    await ativo(DE_OUTRO, ALHEIO, "imagem", "image/png");
  });

  it("lista só os avatares da conta, com os ativos e o src de cada um", async () => {
    const r = await (await api("/api/v1/avatares", admin)).json<{ avatares: { id: string; nome: string; ativos: { id: string; tipo: string; origem: string; foto: boolean; src: string }[] }[] }>();
    expect(r.avatares.map((a) => a.nome)).toEqual(["Marina"]);
    const foto = r.avatares[0]!.ativos.find((x) => x.id === FOTO)!;
    expect(foto).toMatchObject({ tipo: "imagem", origem: "enviado", foto: true, src: `/avatares/${AVATAR}/arquivos/${FOTO}` });
    expect(r.avatares[0]!.ativos.find((x) => x.id === GERADO)!.origem).toBe("gerado");
  });

  it("adicionar ativo: imagem e vídeo gerado sem dur; vídeo enviado pede dur; de outra conta não entra", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", ativo: GERADO }, { tipo: "adicionar", ativo: FOTO, sobre: "@v", em: 0 }].map((c, i) => (i === 0 ? { ...c, rotulo: "v" } : c)))).json<Vista>();
    expect(a.canvas.blocks.map((b) => [b.kind, b.src])).toEqual([
      ["video", `/avatares/${AVATAR}/arquivos/${GERADO}`],
      ["image", `/avatares/${AVATAR}/arquivos/${FOTO}`],
    ]);
    expect(a.canvas.blocks[0]!.dur).toBe(10);
    expect(await (await comandos(id, a.revisao, [{ tipo: "adicionar", ativo: ENVIADO }])).json()).toEqual({ erro: "duracao_obrigatoria", comando: 0 });
    expect((await comandos(id, a.revisao, [{ tipo: "adicionar", ativo: ENVIADO, dur: 5 }])).status).toBe(200);
    expect(await (await comandos(id, a.revisao + 1, [{ tipo: "adicionar", ativo: DE_OUTRO }])).json()).toEqual({ erro: "arquivo_indisponivel", comando: 0 });
  });

  it("o rosto do ativo serve ao enquadrar", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", ativo: FOTO, rotulo: "f" }, { tipo: "enquadrar", bloco: "@f", zoom: 2, rosto: true }])).json<Vista>();
    expect(a.canvas.blocks[0]!.frame!.keys![0]).toMatchObject({ x: 0.4, y: 0.3 });
  });

  it("quadros e transcrição: o ativo gerado usa o vídeo; o de outra conta não existe", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    await env.MIDIA.put(`avatares-ativos/${ALHEIO}/${DE_OUTRO}`, new Uint8Array([1]));
    const { id } = await novo();
    const fake = new FakeExportApi();
    const q = await api(`/api/v1/projetos/${id}/quadros?src=/avatares/${AVATAR}/arquivos/${GERADO}&instantes=1`, admin, undefined, fake);
    expect(q.status).toBe(200);
    await q.arrayBuffer();
    expect((await api(`/api/v1/projetos/${id}/transcricao?src=/avatares/${AVATAR}/arquivos/${GERADO}`, admin, undefined, fake, new FakeTranscriber())).status).toBe(200);
    expect((await api(`/api/v1/projetos/${id}/quadros?src=/avatares/${ALHEIO}/arquivos/${DE_OUTRO}&instantes=1`, admin, undefined, fake)).status).toBe(404);
    // O id do ativo com o avatar errado também não passa.
    expect((await api(`/api/v1/projetos/${id}/quadros?src=/avatares/${ALHEIO}/arquivos/${GERADO}&instantes=1`, admin, undefined, fake)).status).toBe(404);
  });

  it("a exportação aceita o ativo do dono do projeto", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    await comandos(id, revisao, [{ tipo: "adicionar", ativo: GERADO, fim: 4 }]);
    const res = await api(`/projetos/${id}/exportar`, admin, { final: "final" }, new FakeExportApi());
    expect(res.status).toBe(201);
  });
});

describe("vídeo do HTML", () => {
  const html = (id: string, body: unknown, r: FakeRenderApi | null) => api(`/api/v1/projetos/${id}/html`, admin, body, null, null, r);

  it("vira um WebM no projeto, do tamanho do Final, e entra como cobertura", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4 }, { tipo: "final", id: "final", resolucao: "1080p", formato: "9:16" }])).json<{ revisao: number; criados: string[] }>();
    const r = new FakeRenderApi();
    const res = await html(id, { nome: "legenda.webm", html: "<div>Oi</div>", duracao: 4 }, r);
    expect(res.status).toBe(201);
    const { arquivo, largura, altura } = await res.json<{ arquivo: { id: string; tipo: string; src: string }; largura: number; altura: number }>();
    expect([largura, altura]).toEqual([1080, 1920]);
    expect(r.calls).toEqual([{ html: "<div>Oi</div>", largura: 1080, altura: 1920, duracao: 4 }]);
    expect(arquivo.tipo).toBe("video/webm");
    expect(await (await env.MIDIA.get(`projetos/${id}/${arquivo.id}`))!.text()).toBe("webm");
    const c = await comandos(id, a.revisao, [{ tipo: "adicionar", arquivo: arquivo.id, dur: 4, sobre: a.criados[0], em: 0 }]);
    expect(c.status).toBe(200);
  });

  it("projeto sem Final usa 720 × 1280; Final que não existe é recusado", async () => {
    const { id } = await novo();
    const r = new FakeRenderApi();
    expect((await html(id, { html: "<p>x</p>", duracao: 2 }, r)).status).toBe(201);
    expect(r.calls[0]).toMatchObject({ largura: 720, altura: 1280 });
    expect(await (await html(id, { html: "<p>x</p>", duracao: 2, final: "outro" }, r)).json()).toEqual({ erro: "final_inexistente" });
  });

  it("recusa HTML vazio, duração fora do limite e sem contêiner avisa", async () => {
    const { id } = await novo();
    const r = new FakeRenderApi();
    expect(await (await html(id, { html: " ", duracao: 2 }, r)).json()).toEqual({ erro: "html_invalido" });
    expect(await (await html(id, { html: "<p>x</p>", duracao: 61 }, r)).json()).toEqual({ erro: "duracao_invalida" });
    expect(await (await html(id, { html: "<p>x</p>" }, r)).json()).toEqual({ erro: "duracao_invalida" });
    expect((await html(id, { html: "x".repeat(1024 * 1024 + 1), duracao: 2 }, r)).status).toBe(413);
    expect(r.calls).toHaveLength(0);
    expect(await (await html(id, { html: "<p>x</p>", duracao: 2 }, null)).json()).toEqual({ erro: "render_indisponivel" });
  });

  it("HTML que não roda devolve o log para o agente corrigir, sem guardar arquivo", async () => {
    const { id } = await novo();
    const r = new FakeRenderApi();
    r.log = "ReferenceError: gsapp is not defined";
    const res = await html(id, { html: "<script>gsapp.to()</script>", duracao: 2 }, r);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ erro: "render_falhou", detalhe: "ReferenceError: gsapp is not defined" });
    expect((await (await api(`/api/v1/projetos/${id}?incluir=arquivos`, admin)).json<{ arquivos: unknown[] }>()).arquivos).toEqual([]);
  });

  it("contêiner que não responde é um erro com código, sem guardar arquivo", async () => {
    const { id } = await novo();
    const r = new FakeRenderApi();
    r.fail = "Container port connection closed";
    const res = await html(id, { html: "<p>x</p>", duracao: 2 }, r);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erro: "conteiner_falhou" });
    expect((await (await api(`/api/v1/projetos/${id}?incluir=arquivos`, admin)).json<{ arquivos: unknown[] }>()).arquivos).toEqual([]);
  });

  it("projeto de outra conta não existe", async () => {
    const { id } = await novo();
    await memberCookie();
    const { email } = (await env.DB.prepare("SELECT email FROM users WHERE role = 'member'").first<{ email: string }>())!;
    const membro = await token(email, "ma_membro");
    expect((await api(`/api/v1/projetos/${id}/html`, membro, { html: "<p>x</p>", duracao: 2 }, null, null, new FakeRenderApi())).status).toBe(404);
  });
});

describe("legenda do grupo", () => {
  type Simulado = { duracao: number; palavras: { palavra: string; inicio: number; fim: number; bloco?: string }[]; trechos: { texto: string; inicio: number; fim: number }[] };
  const legenda = (id: string, body: unknown, t: FakeTranscriber | null = new FakeTranscriber(), r: FakeRenderApi | null = new FakeRenderApi()) => api(`/api/v1/projetos/${id}/legenda`, admin, body, new FakeExportApi(), t, r);

  /** Um grupo de 6 s: o vídeo inteiro de 0 a 3 s e, em 2×, de 2,5 s a 8,5 s do mesmo arquivo. */
  async function falando() {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 3, rotulo: "a" }, { tipo: "adicionar", video: VIDEO, inicio: 2.5, fim: 8.5, depois: "@a", rotulo: "b" }, { tipo: "velocidade", bloco: "@b", velocidade: 2 }])).json<{ revisao: number; criados: string[] }>();
    return { id, grupo: a.criados[0]!, b: a.criados[1]!, revisao: a.revisao };
  }

  it("simular traz as palavras no tempo do grupo e os trechos, sem fazer vídeo", async () => {
    const { id, grupo, b } = await falando();
    const r = new FakeRenderApi();
    const s = await (await legenda(id, { grupo, simular: true }, new FakeTranscriber(), r)).json<Simulado>();
    expect(s.duracao).toBe(6);
    // A fala falsa (test/helpers.ts) termina em "hoje vou mostrar" (2,5 s a 3,6 s). O primeiro bloco corta em 3 s
    // (sem o "mostrar"); o segundo repete o fim, acelerado, e as palavras seguidas formam um trecho de 4.
    expect(s.palavras.filter((p) => p.bloco === b)).toEqual([
      { palavra: "hoje", bloco: b, inicio: 3, fim: 3.15 },
      { palavra: "vou", bloco: b, inicio: 3.15, fim: 3.25 },
      { palavra: "mostrar", bloco: b, inicio: 3.25, fim: 3.55 },
    ]);
    expect(s.trechos.map((t) => t.texto)).toEqual(["Oi,", "gente,", "é,", "hoje vou hoje vou", "mostrar"]);
    expect(r.calls).toHaveLength(0);
  });

  it("põe a legenda como animação em código por cima do grupo, com as palavras corrigidas pelo agente", async () => {
    const { id, grupo, revisao } = await falando();
    const r = new FakeRenderApi();
    const res = await legenda(id, { grupo, revisao, palavras: [{ palavra: "Brasil.", inicio: 0.2, fim: 0.8 }], estilo: { fonte: "TikTok Sans", destaque: "#ffd400" } }, null, r);
    expect(res.status).toBe(200);
    type Saida = { revisao: number; criados: string[]; grupos: { blocos: { id: string; tipo: string; camada: string; inicio: number; fim: number; nome: string }[] }[]; legenda: { trechos: { texto: string }[] } };
    const out = await res.json<Saida>();
    expect(out.revisao).toBe(revisao + 1);
    expect(out.legenda.trechos.map((t) => t.texto)).toEqual(["Brasil."]);
    expect(out.grupos[0]!.blocos.find((x) => x.id === out.criados[0])).toMatchObject({ tipo: "animacao", camada: "cobertura", nome: "Legenda", inicio: 0, fim: 6 });
    // Nada é renderizado agora: a exportação faz o vídeo.
    expect(r.calls).toHaveLength(0);
    const v = await (await api(`/api/v1/projetos/${id}?incluir=codigo`, admin)).json<{ codigo: { html: string }[] }>();
    expect(v.codigo[0]!.html).toContain("BRASIL.");
    expect(v.codigo[0]!.html).toContain('"TikTok Sans"');
    expect(v.codigo[0]!.html).toContain('"#ffd400"');
  });

  it("com bloco, troca o código e o tempo da legenda que já existe, sem pôr outra", async () => {
    const { id, grupo, revisao } = await falando();
    const primeira = await (await legenda(id, { grupo, revisao, palavras: [{ palavra: "Antes.", inicio: 0.2, fim: 0.8 }] }, null)).json<{ revisao: number; criados: string[] }>();
    const bloco = primeira.criados[0]!;
    const out = await (await legenda(id, { grupo, revisao: primeira.revisao, bloco, palavras: [{ palavra: "Depois.", inicio: 0.2, fim: 0.8 }] }, null)).json<{ criados: string[] }>();
    expect(out.criados).toEqual([]);
    const v = await (await api(`/api/v1/projetos/${id}?incluir=codigo`, admin)).json<{ codigo: { bloco: string; html: string; duracao: number }[] }>();
    expect(v.codigo).toHaveLength(1);
    expect(v.codigo[0]).toMatchObject({ bloco, duracao: 6 });
    expect(v.codigo[0]!.html).toContain("DEPOIS.");
    // Sem a revisão, ou com uma velha, nada muda.
    expect(await (await legenda(id, { grupo, palavras: [{ palavra: "X.", inicio: 0.2, fim: 0.8 }] }, null)).json()).toEqual({ erro: "revisao_obrigatoria" });
    expect((await legenda(id, { grupo, revisao, palavras: [{ palavra: "X.", inicio: 0.2, fim: 0.8 }] }, null)).status).toBe(409);
  });

  it("recusa grupo que não existe, estilo fora da lista e palavras malformadas", async () => {
    const { id, grupo } = await falando();
    expect(await (await legenda(id, { grupo: "x", simular: true })).json()).toEqual({ erro: "grupo_inexistente" });
    expect(await (await legenda(id, { grupo, estilo: { fonte: "Comic Sans" } })).json()).toEqual({ erro: "estilo_invalido" });
    expect(await (await legenda(id, { grupo, estilo: { cor: "red" } })).json()).toEqual({ erro: "estilo_invalido" });
    expect(await (await legenda(id, { grupo, palavras: [{ palavra: "x" }] })).json()).toEqual({ erro: "palavras_invalidas" });
    expect(await (await legenda(id, { grupo, semTexto: [[2, 1]] })).json()).toEqual({ erro: "sem_texto_invalido" });
    expect(await (await legenda(id, { grupo, simular: true }, null)).json()).toEqual({ erro: "transcricao_indisponivel" });
  });

  it("grupo sem bloco que fala não tem legenda", async () => {
    const { id, revisao } = await novo();
    const a = await (await comandos(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 3 }, { tipo: "som", bloco: "@x", mudo: true }].map((c, i) => (i === 0 ? { ...c, rotulo: "x" } : c)))).json<{ criados: string[] }>();
    expect(await (await legenda(id, { grupo: a.criados[0], simular: true })).json()).toEqual({ erro: "sem_fala" });
  });
});

describe("rascunho", () => {
  type Bloco = { id: string; kind: string; src: string; x: number; tin: number; tout: number; draft?: { fala: string }; speed?: number };
  type Vista = { revisao: number; criados: string[]; grupos: { id: string; duracao: number; blocos: { id: string }[] }[]; avisos: { tipo: string; bloco?: string; fala?: string; segundos?: number }[]; canvas: { blocks: Bloco[] } };
  const lote = async (id: string, revisao: number, lista: unknown[]) => (await comandos(id, revisao, lista)).json<Vista>();

  it("marca o lugar com a fala e a duração estimada, e avisa que falta o vídeo", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [
      { tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" },
      { tipo: "rascunho", fala: "Agora o mais importante: o que muda para você.", duracao: 3.5, depois: "@a", rotulo: "r" },
      { tipo: "adicionar", video: VIDEO2, fim: 2, depois: "@r" },
    ]);
    const rascunho = r.canvas.blocks.find((b) => b.draft)!;
    expect(rascunho).toMatchObject({ kind: "image", src: "", tin: 0, tout: 3.5, draft: { fala: "Agora o mais importante: o que muda para você." } });
    expect(r.grupos[0]!.duracao).toBe(9.5);
    expect(r.avisos).toEqual([{ tipo: "rascunho", bloco: rascunho.id, fala: "Agora o mais importante: o que muda para você.", segundos: 3.5 }]);
  });

  it("trocar põe o vídeo pronto no lugar, e a sequência acompanha a duração nova", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [
      { tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" },
      { tipo: "rascunho", fala: "Fala do meio", duracao: 3, depois: "@a", rotulo: "r" },
      { tipo: "adicionar", video: VIDEO2, fim: 2, depois: "@r", rotulo: "c" },
    ]);
    const [, meio, fim] = r.criados;
    const t = await lote(id, r.revisao, [{ tipo: "trocar", bloco: meio, video: VIDEO2, fim: 6 }]);
    const b = t.canvas.blocks.find((o) => o.id === meio)!;
    expect(b).toMatchObject({ kind: "video", src: `/videos/${VIDEO2}.mp4`, tin: 0, tout: 6 });
    expect(b.draft).toBeUndefined();
    // 4 s + 6 s + 2 s: o último bloco anda para depois do vídeo novo.
    expect(t.grupos[0]!.duracao).toBe(12);
    expect(t.canvas.blocks.find((o) => o.id === fim)!.x).toBe(10 * 40);
    expect(t.avisos).toEqual([]);
  });

  it("recusa fala vazia, duração fora do limite e troca por áudio ou por arquivo que não existe", async () => {
    const { id, revisao } = await novo();
    expect(await (await comandos(id, revisao, [{ tipo: "rascunho", fala: " ", duracao: 3 }])).json()).toEqual({ erro: "fala_invalida", comando: 0 });
    expect(await (await comandos(id, revisao, [{ tipo: "rascunho", fala: "Oi", duracao: 31 }])).json()).toEqual({ erro: "duracao_invalida", comando: 0 });
    const r = await lote(id, revisao, [{ tipo: "rascunho", fala: "Oi", duracao: 3 }]);
    expect(await (await comandos(id, r.revisao, [{ tipo: "trocar", bloco: r.criados[0], video: OCULTO }])).json()).toEqual({ erro: "arquivo_indisponivel", comando: 0 });
    const arquivo = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO project_files (id, project_id, key, name, type, size, created_at) VALUES (?, ?, 'x', 'm.m4a', 'audio/mp4', 1, ?)").bind(arquivo, id, new Date().toISOString()).run();
    expect(await (await comandos(id, r.revisao, [{ tipo: "trocar", bloco: r.criados[0], arquivo, dur: 5 }])).json()).toEqual({ erro: "posicao_invalida", comando: 0 });
  });

  it("o nome é Texto 1, Texto 2..., e o agente pode mudar com renomear", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [
      { tipo: "rascunho", fala: "Primeira", duracao: 2, rotulo: "a" },
      { tipo: "rascunho", fala: "Segunda", duracao: 2, depois: "@a", rotulo: "b" },
      { tipo: "renomear", bloco: "@b", nome: "Gancho" },
      { tipo: "rascunho", fala: "Terceira", duracao: 2, depois: "@b" },
      { tipo: "rascunho", fala: "Quarta", duracao: 2, nome: "CTA" },
    ]);
    expect(r.canvas.blocks.map((b) => (b as unknown as { name: string }).name)).toEqual(["Texto 1", "Gancho", "Texto 2", "CTA"]);
    expect(await (await comandos(id, r.revisao, [{ tipo: "renomear", bloco: r.criados[0], nome: " " }])).json()).toEqual({ erro: "nome_invalido", comando: 0 });
    expect(await (await comandos(id, r.revisao, [{ tipo: "renomear", bloco: "x", nome: "Y" }])).json()).toEqual({ erro: "bloco_inexistente", comando: 0 });
  });

  it("não exporta enquanto houver rascunho", async () => {
    const { id, revisao } = await novo();
    await lote(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" }, { tipo: "rascunho", fala: "Falta gravar", duracao: 3, depois: "@a" }]);
    const res = await api(`/projetos/${id}/exportar`, admin, { final: "final" }, new FakeExportApi());
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("rascunho");
  });
});

describe("animação em código", () => {
  type Bloco = { id: string; kind: string; src: string; name: string; tin: number; tout: number; dur: number; code?: { html: string; params?: Record<string, unknown> } };
  type Vista = { revisao: number; criados: string[]; grupos: { id: string; blocos: { id: string; tipo: string; camada: string; inicio: number; fim: number }[] }[]; canvas: { blocks: Bloco[] } };
  const lote = async (id: string, revisao: number, lista: unknown[]) => (await comandos(id, revisao, lista)).json<Vista>();
  const CENA = `<div id="t">Oi</div><script>tl.from("#t", { opacity: 0, duration: 0.5 }, 0.2);</script>`;

  it("guarda o código por cima do vídeo, do tamanho pedido, e o ver_projeto o traz em incluir: codigo", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [
      { tipo: "adicionar", video: VIDEO, fim: 6, rotulo: "a" },
      { tipo: "adicionar", html: CENA, duracao: 3, sobre: "@a", em: 1 },
      { tipo: "adicionar", html: CENA, duracao: 45 },
    ]);
    const [, cena, longa] = r.criados;
    expect(r.canvas.blocks.find((b) => b.id === cena)).toMatchObject({ kind: "image", src: "", name: "Animação 1", tin: 0, tout: 3, code: { html: CENA } });
    expect(r.canvas.blocks.find((b) => b.id === longa)).toMatchObject({ name: "Animação 2", tout: 45 });
    expect(r.grupos[0]!.blocos[1]).toMatchObject({ id: cena, tipo: "animacao", camada: "cobertura", inicio: 1, fim: 4 });
    const v = await (await api(`/api/v1/projetos/${id}?incluir=codigo`, admin)).json<{ codigo: unknown[] }>();
    expect(v.codigo).toEqual([
      { bloco: cena, nome: "Animação 1", duracao: 3, html: CENA },
      { bloco: longa, nome: "Animação 2", duracao: 45, html: CENA },
    ]);
    // A animação vai até 60 s, mais que a imagem.
    const c = await lote(id, r.revisao, [{ tipo: "cortar", bloco: longa, fim: 60 }]);
    expect(c.canvas.blocks.find((b) => b.id === longa)!.tout).toBe(60);
  });

  it("editarCodigo troca o código inteiro ou só os trechos pedidos", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", html: CENA, duracao: 2 }]);
    const cena = r.criados[0]!;
    const t = await lote(id, r.revisao, [{ tipo: "editarCodigo", bloco: cena, trocas: [{ de: ">Oi<", para: ">Olá<" }, { de: "0.2);", para: "0.4);" }] }]);
    expect(t.canvas.blocks[0]!.code!.html).toBe(CENA.replace(">Oi<", ">Olá<").replace("0.2);", "0.4);"));
    const n = await lote(id, t.revisao, [{ tipo: "editarCodigo", bloco: cena, html: "<b>Novo</b>" }]);
    expect(n.canvas.blocks[0]!.code!.html).toBe("<b>Novo</b>");
  });

  it("recusa código vazio, grande demais, trecho que não existe ou se repete e bloco sem código", async () => {
    const { id, revisao } = await novo();
    const erro = async (lista: unknown[], rev = revisao) => (await comandos(id, rev, lista)).json();
    expect(await erro([{ tipo: "adicionar", html: " ", duracao: 2 }])).toEqual({ erro: "codigo_invalido", comando: 0 });
    expect(await erro([{ tipo: "adicionar", html: "x".repeat(100_001), duracao: 2 }])).toEqual({ erro: "codigo_grande_demais", comando: 0, maximo: 100_000 });
    expect(await erro([{ tipo: "adicionar", html: CENA, duracao: 61 }])).toEqual({ erro: "duracao_invalida", comando: 0 });
    const r = await lote(id, revisao, [{ tipo: "adicionar", html: "<i>a</i><i>a</i>", duracao: 2 }, { tipo: "adicionar", video: VIDEO, fim: 4 }]);
    const [cena, video] = r.criados;
    expect(await erro([{ tipo: "editarCodigo", bloco: cena, trocas: [{ de: "<i>a</i>", para: "" }] }], r.revisao)).toEqual({ erro: "trecho_nao_unico", comando: 0, troca: 0, vezes: 2 });
    expect(await erro([{ tipo: "editarCodigo", bloco: cena, trocas: [{ de: "nada", para: "" }] }], r.revisao)).toEqual({ erro: "trecho_nao_unico", comando: 0, troca: 0, vezes: 0 });
    expect(await erro([{ tipo: "editarCodigo", bloco: cena, html: "<b>x</b>", trocas: [] }], r.revisao)).toEqual({ erro: "codigo_invalido", comando: 0 });
    expect(await erro([{ tipo: "editarCodigo", bloco: video, html: "<b>x</b>" }], r.revisao)).toEqual({ erro: "sem_codigo", comando: 0 });
    expect(await erro([{ tipo: "enquadrar", bloco: cena, zoom: 2 }], r.revisao)).toEqual({ erro: "enquadramento_invalido", comando: 0 });
  });

  it("a inspeção abre o código do bloco no tamanho do Final, nos instantes pedidos ou nos quartos", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", html: CENA, duracao: 2, rotulo: "a" }, { tipo: "final", id: "final", resolucao: "1080p", formato: "9:16" }]);
    const cena = r.criados[0]!;
    const fake = new FakeRenderApi();
    const inspeciona = (q: string, f: FakeRenderApi | null = fake) => api(`/api/v1/projetos/${id}/animacao?${q}`, admin, undefined, null, null, f);
    const res = await inspeciona(`bloco=${cena}&instantes=0.5,1.5`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ largura: 1080, altura: 1920, problemas: [{ tipo: "quebrou", alvo: "#titulo", t: [1.5] }] });
    expect(fake.inspections[0]).toEqual({ html: CENA, largura: 1080, altura: 1920, duracao: 2, instantes: [0.5, 1.5], quadros: false });
    await inspeciona(`bloco=${cena}&quadros=1`);
    expect(fake.inspections[1]).toMatchObject({ instantes: [0, 0.5, 1, 1.5, 2], quadros: true });
  });

  it("a inspeção aponta parâmetro que o código usa sem valor, no texto e nos scripts", async () => {
    const { id, revisao } = await novo();
    const html = '<b>{{nome}}</b><i>{{preco}}</i><script>tl.to("b", { x: params.x }, 0);</script>';
    const r = await lote(id, revisao, [{ tipo: "adicionar", html, duracao: 2, parametros: { nome: "Ana" } }]);
    const fake = new FakeRenderApi();
    const res = await (await api(`/api/v1/projetos/${id}/animacao?bloco=${r.criados[0]}&instantes=1`, admin, undefined, null, null, fake)).json<{ problemas: { tipo: string; alvo: string }[] }>();
    expect(res.problemas.filter((p) => p.tipo === "parametro_sem_valor")).toEqual([
      { tipo: "parametro_sem_valor", alvo: "{{preco}}", t: [], detalhe: "sem preco em parametros, o texto sai como está" },
      { tipo: "parametro_sem_valor", alvo: "params.x", t: [], detalhe: "sem x em parametros, o script recebe undefined" },
    ]);
    // O contêiner recebe o código já com os valores que existem.
    expect(fake.inspections[0]!.html).toContain("<b>Ana</b><i>{{preco}}</i>");
  });

  it("a inspeção recusa bloco sem código, instante fora do bloco e avisa sem contêiner ou com a página quebrada", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", html: CENA, duracao: 2 }, { tipo: "adicionar", video: VIDEO, fim: 4 }]);
    const [cena, video] = r.criados;
    const fake = new FakeRenderApi();
    const inspeciona = async (q: string, f: FakeRenderApi | null = fake) => (await api(`/api/v1/projetos/${id}/animacao?${q}`, admin, undefined, null, null, f)).json();
    expect(await inspeciona("bloco=nada")).toEqual({ erro: "bloco_inexistente" });
    expect(await inspeciona(`bloco=${video}`)).toEqual({ erro: "bloco_sem_codigo" });
    expect(await inspeciona(`bloco=${cena}&instantes=3`)).toEqual({ erro: "instantes_invalidos" });
    expect(await inspeciona(`bloco=${cena}&instantes=${Array(13).fill(1).join(",")}`)).toEqual({ erro: "instantes_invalidos" });
    expect(await inspeciona(`bloco=${cena}&final=outro`)).toEqual({ erro: "final_inexistente" });
    expect(fake.inspections).toHaveLength(0);
    expect(await inspeciona(`bloco=${cena}`, null)).toEqual({ erro: "render_indisponivel" });
    fake.log = "Chrome não abriu";
    expect(await inspeciona(`bloco=${cena}`)).toEqual({ erro: "render_falhou", detalhe: "Chrome não abriu" });
  });

  it("a inspeção de projeto de outra conta não existe", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", html: CENA, duracao: 2 }]);
    await memberCookie();
    const { email } = (await env.DB.prepare("SELECT email FROM users WHERE role = 'member'").first<{ email: string }>())!;
    const membro = await token(email, "ma_membro");
    const fake = new FakeRenderApi();
    expect((await api(`/api/v1/projetos/${id}/animacao?bloco=${r.criados[0]}`, membro, undefined, null, null, fake)).status).toBe(404);
    expect(fake.inspections).toHaveLength(0);
  });

  it("parâmetros: o template guarda os valores, editarCodigo troca e tira, e chave ruim é recusada", async () => {
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", html: "<b>{{nome}}</b>", duracao: 2, parametros: { nome: "Ana", preco: 49 } }]);
    const cena = r.criados[0]!;
    const t = await lote(id, r.revisao, [{ tipo: "editarCodigo", bloco: cena, parametros: { nome: "Bia", preco: null, cor: "#ff3d7f" } }]);
    expect(t.canvas.blocks[0]!.code).toEqual({ html: "<b>{{nome}}</b>", params: { nome: "Bia", cor: "#ff3d7f" } });
    const v = await (await api(`/api/v1/projetos/${id}?incluir=codigo`, admin)).json<{ codigo: { parametros: unknown }[] }>();
    expect(v.codigo[0]!.parametros).toEqual({ nome: "Bia", cor: "#ff3d7f" });
    expect(await (await comandos(id, t.revisao, [{ tipo: "editarCodigo", bloco: cena, parametros: { "1x": "a" } }])).json()).toEqual({ erro: "parametros_invalidos", comando: 0, parametro: "1x" });
    expect(await (await comandos(id, t.revisao, [{ tipo: "editarCodigo", bloco: cena, parametros: { nome: { a: 1 } } }])).json()).toEqual({ erro: "parametros_invalidos", comando: 0, parametro: "nome" });
  });

  it("outro valor de parâmetro faz outro vídeo na exportação; o mesmo valor reaproveita", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" }, { tipo: "adicionar", html: "<b>{{nome}}</b>", duracao: 2, sobre: "@a", em: 0, parametros: { nome: "Ana" } }]);
    const fake = new FakeExportApi();
    const render = new FakeRenderApi();
    const exportar = async () => {
      let e = await (await api(`/projetos/${id}/exportar`, admin, { final: "final" }, fake, null, render)).json<{ id: string; status: string }>();
      for (let i = 0; i < 6 && e.status !== "done"; i++) e = await (await api(`/projetos/${id}/exportacoes/${e.id}`, admin, {}, fake, null, render)).json();
    };
    await exportar();
    expect(render.calls[0]!.html).toContain("<b>Ana</b>");
    const t = await lote(id, r.revisao, [{ tipo: "editarCodigo", bloco: r.criados[1], parametros: { nome: "Bia" } }]);
    await exportar();
    expect(render.calls).toHaveLength(2);
    expect(render.calls[1]!.html).toContain("<b>Bia</b>");
    await lote(id, t.revisao, [{ tipo: "editarCodigo", bloco: r.criados[1], parametros: { nome: "Ana" } }]);
    await exportar();
    expect(render.calls).toHaveLength(2);
  });

  it("a exportação faz o vídeo da animação uma vez só, no tamanho do Final, e põe por cima como vídeo sem som", async () => {
    await env.MIDIA.put(`videos/${VIDEO}.mp4`, new Uint8Array([1, 2, 3]));
    const { id, revisao } = await novo();
    const r = await lote(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" }, { tipo: "adicionar", html: CENA, duracao: 2, sobre: "@a", em: 1 }]);
    const fake = new FakeExportApi();
    const render = new FakeRenderApi();
    const exportar = async () => {
      let e = await (await api(`/projetos/${id}/exportar`, admin, { final: "final" }, fake, null, render)).json<{ id: string; status: string; total: number }>();
      const total = e.total;
      for (let i = 0; i < 6 && e.status !== "done"; i++) e = await (await api(`/projetos/${id}/exportacoes/${e.id}`, admin, {}, fake, null, render)).json();
      expect(e.status).toBe("done");
      return total;
    };
    // Uma animação, um trecho e uma versão.
    expect(await exportar()).toBe(3);
    expect(render.calls).toEqual([{ html: CENA, largura: 720, altura: 1280, duracao: 2 }]);
    const plano = JSON.parse(fake.segments[0]!.plan) as { itens: { tipo: string; volume: number; entra: number; codigo?: string }[] };
    expect(plano.itens[1]).toMatchObject({ tipo: "video", camada: "cobertura", volume: 0, entra: 1 });
    expect(plano.itens[1]!.codigo).toBeUndefined();
    // Outro corte no vídeo refaz o trecho, mas a animação já está guardada.
    await lote(id, r.revisao, [{ tipo: "cortar", bloco: r.criados[0], fim: 3.5 }]);
    await exportar();
    expect(fake.segments).toHaveLength(2);
    expect(render.calls).toHaveLength(1);
  });

  it("sem o contêiner de render, a exportação com animação é recusada logo", async () => {
    const { id, revisao } = await novo();
    await lote(id, revisao, [{ tipo: "adicionar", video: VIDEO, fim: 4, rotulo: "a" }, { tipo: "adicionar", html: CENA, duracao: 2, sobre: "@a", em: 0 }]);
    const res = await api(`/projetos/${id}/exportar`, admin, { final: "final" }, new FakeExportApi());
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(ERROS.exportarIndisponivel.split(" ")[0]!);
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
  const p = await (await api(`/api/v1/projetos/${id}?incluir=arquivos,canvas`, admin)).json<{ canvas: { edges: { id: string }[] } }>();
  return p.canvas.edges.map((e) => e.id);
}
