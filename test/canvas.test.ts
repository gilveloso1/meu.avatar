import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ERROS } from "../src/erros";
import { MAX_IMAGE_BYTES } from "../src/studio";
import { Db } from "../src/db";
import { Exports } from "../src/exportar";
import { call, cookie, FakeExportApi, FakeVideoApi, memberCookie, SITE } from "./helpers";

const get = async (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session === undefined ? {} : { cookie: session } }), new FakeVideoApi());
const post = (path: string, session: string, body: BodyInit | null = null, headers: Record<string, string> = {}) =>
  call(new Request(`${SITE}${path}`, { method: "POST", body, headers: { origin: SITE, cookie: session, ...headers } }), new FakeVideoApi());

/** Um vídeo pronto (e um que ainda está na fila) direto no banco. */
async function videos() {
  const now = new Date().toISOString();
  const insert = (id: string, status: string, key: string | null) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, video_key, structure, created_at, updated_at) VALUES (?, ?, ?, 'alibaba/wan-3.0', 10, '480p', '9:16', ?, 'wan', ?, ?)",
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
  it("Novo projeto abre o canvas com os vídeos prontos, o projeto e as frases do catálogo", async () => {
    const admin = await cookie();
    await videos();
    const id = await novo(admin);
    const res = await get(`/canvas/${id}`, admin);
    expect(res.status).toBe(200);
    const c = config(await res.text());
    expect(c.videos).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", name: "Oi, gente! Hoje eu vou mostrar", src: "/videos/11111111-1111-4111-8111-111111111111.mp4", when: expect.any(String) },
    ]);
    expect(c.projeto).toMatchObject({ id, name: "Projeto sem nome", data: { blocks: [], edges: [] }, salvar: `/projetos/${id}/salvar`, arquivos: `/projetos/${id}/arquivos` });
    expect(c.erros).toMatchObject({ arquivo: ERROS.canvasArquivo, salvar: ERROS.canvasSalvar, nome: ERROS.projetoNome });
    expect(res.headers.get("content-security-policy")).toContain("img-src 'self' blob: data:");
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'self' blob:");
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
    const tipo = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array([1]), { "content-type": "application/pdf" });
    expect([tipo.status, await tipo.text()]).toEqual([400, ERROS.canvasArquivo]);
    const grande = await post(`/projetos/${id}/arquivos`, admin, new Uint8Array(MAX_IMAGE_BYTES + 1), { "content-type": "image/png" });
    expect([grande.status, await grande.text()]).toEqual([413, ERROS.canvasArquivoGrande(MAX_IMAGE_BYTES / 1024 / 1024)]);
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
  type Estado = { id: string; status: string; feitos: number; total: number; versoes: { nome: string; href: string }[]; zip: string | null; erro: string | null };
  /** Pede e chama os passos, como a tela faz. */
  async function exportar(fake: FakeExportApi, id: string, session: string, body: unknown = { final: "final" }): Promise<Estado> {
    const res = await com(fake, `/projetos/${id}/exportar`, session, body);
    expect(res.status).toBe(201);
    let st = (await res.json()) as Estado;
    for (let i = 0; st.status === "running" && i < 20; i++) st = (await (await com(fake, `/projetos/${id}/exportacoes/${st.id}`, session, {})).json()) as Estado;
    return st;
  }

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
    expect([mp4.status, await mp4.text(), mp4.headers.get("content-disposition")]).toEqual([200, "mp4ok", 'attachment; filename="02-variacao-2.mp4"']);
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
    const row = await exports.start((await new Db(env.DB).projectById(id))!, "admin", "final", undefined, depois);
    for (let i = 0; i < row.total; i++) await exports.advance(row.id);
    expect([fake.segments.length, fake.joins.length]).toEqual([0, 2]);
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
    expect(new TextDecoder().decode(bytes.slice(central + 46, central + 46 + nome))).toBe("01-variacao-1.mp4");
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

  it("vídeo de um modelo que a pessoa não pode usar não entra", async () => {
    const admin = await cookie();
    const id = await projeto(admin);
    await env.DB.prepare("UPDATE videos SET structure = 'seedance'").run();
    const project = (await new Db(env.DB).projectById(id))!;
    await expect(new Exports(new Db(env.DB), env.MIDIA, new FakeExportApi()).start(project, "member", "final")).rejects.toThrow(ERROS.exportarArquivo);
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

  it("cada Final exporta até 50 variações, mesmo com mais ligações", async () => {
    const admin = await cookie();
    const fake = new FakeExportApi();
    const ok = await com(fake, `/projetos/${await projeto(admin, muitas(10))}/exportar`, admin, { final: "final" });
    expect([ok.status, ((await ok.json()) as Estado).total]).toEqual([201, 15 + 50]);
    const id = await projeto(admin, muitas(11));
    const mais = await com(fake, `/projetos/${id}/exportar`, admin, { final: "final" });
    expect([mais.status, ((await mais.json()) as Estado).versoes.length <= 50]).toEqual([201, true]);
    expect((await env.DB.prepare("SELECT plan FROM exports ORDER BY rowid DESC LIMIT 1").first<{ plan: string }>())!.plan.match(/"nome"/g)!.length).toBe(50);
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
