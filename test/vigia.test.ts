/**
 * Alarme de contêiner ligado sem trabalho (src/vigia.ts), com respostas falsas do painel da
 * Cloudflare. O AudioFixer é o contêiner de teste (test/worker.ts): o Durable Object e a parada
 * à força são de verdade, só o contêiner é falso.
 */
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { type Alarme, CHAVE, LIMITE_MS, ligadoDesde, Painel, type Vigiado, vigiar } from "../src/vigia";
import { vigiaConteineres } from "../src/index";
import type { Env } from "../src/env";
import { call, cookie, dono, memberCookie, postForm, SITE } from "./helpers";

const APPS = [
  { id: "app-audio", name: "meu-avatar-audiofixer" },
  { id: "app-exportar", name: "meu-avatar-exporter" },
  { id: "app-render", name: "meu-avatar-renderer" },
];
const MIN = 60_000;
const AGORA = new Date("2026-11-03T12:00:00Z");

/** O painel falso: minutos com memória por aplicação e o minuto mais novo das invocações do Worker. */
function painel(uso: Record<string, number[]>, workerAte: number | null = AGORA.getTime() - 2 * MIN): Painel {
  const minuto = (t: number) => new Date(t).toISOString().replace(".000", "");
  const fake = async (url: RequestInfo | URL) => {
    if (String(url).endsWith("/containers/applications")) return Response.json({ success: true, result: APPS });
    const grupos = Object.entries(uso).flatMap(([applicationId, ts]) => ts.map((t) => ({ dimensions: { applicationId, datetimeMinute: minuto(t) }, sum: { allocatedMemory: 8.6e10 } })));
    const invocacoes = workerAte === null ? [] : [{ dimensions: { datetimeMinute: minuto(workerAte) } }];
    return Response.json({ data: { viewer: { accounts: [{ containersUsageAdaptiveGroups: grupos, workersInvocationsAdaptive: invocacoes }] } }, errors: null });
  };
  return new Painel("token", "conta", fake as typeof fetch);
}

/** Um minuto por minuto de `de` a `ate` minutos atrás. */
const ligado = (de: number, ate = 3) => Array.from({ length: de - ate + 1 }, (_, i) => AGORA.getTime() - (de - i) * MIN);

/** O AudioFixer com o banco de verdade e o contêiner de teste; os outros dois desligados no painel. */
function vigiados(nome: string): Vigiado[] {
  const db = new Db(env.DB);
  const stub = env.TESTE_CONTEINER.getByName(nome);
  return [
    { classe: "AudioFixer", trabalhoNoBanco: () => db.audioWorking(), pararSeOcioso: (ms) => stub.pararSeOcioso(ms) },
    { classe: "Exporter", trabalhoNoBanco: () => db.exportWorking(), pararSeOcioso: async () => "desligado" },
    { classe: "Renderer", trabalhoNoBanco: async () => false, pararSeOcioso: async () => "desligado" },
  ];
}

const destruido = (nome: string) => runInDurableObject(env.TESTE_CONTEINER.getByName(nome), (obj) => obj.falso().destruido);
const guardado = () => new Db(env.DB).alarm<Alarme>(CHAVE);

describe("alarme de contêiner ligado sem trabalho", () => {
  it("painel sem linhas: tudo desligado, nenhum aviso", async () => {
    expect(await vigiar(painel({}), vigiados("vazio"), new Db(env.DB), AGORA)).toEqual({ ligados: [] });
    expect(await guardado()).toBeNull();
    expect(await destruido("vazio")).toBe(false);
  });

  it("ligado há uma hora, mas com áudio sendo tratado: nenhum aviso", async () => {
    await env.DB.prepare("INSERT INTO videos (user_id, id, prompt, model, duration, resolution, aspect_ratio, status, created_at, updated_at, audio_status) VALUES (?, 'v1', 'oi', 'm', 5, '480p', '9:16', 'completed', ?, ?, 'processing')")
      .bind(await dono(), AGORA.toISOString(), AGORA.toISOString())
      .run();
    expect(await vigiar(painel({ "app-audio": ligado(60) }), vigiados("tratando"), new Db(env.DB), AGORA)).toEqual({ ligados: [] });
    expect(await destruido("tratando")).toBe(false);
  });

  it("ligado há uma hora com pedido recente ao contêiner: nenhum aviso", async () => {
    const nome = "pedido-recente";
    await env.TESTE_CONTEINER.getByName(nome).configurar(60 * MIN, "1h", 10_000, true);
    expect(await vigiar(painel({ "app-audio": ligado(60) }), vigiados(nome), new Db(env.DB), AGORA)).toEqual({ ligados: [] });
    expect(await destruido(nome)).toBe(false);
  });

  it("ligado sem trabalho além do limite: avisa, para à força e mostra ao administrador", async () => {
    const alarme = await vigiar(painel({ "app-audio": ligado(45) }), vigiados("ocioso"), new Db(env.DB), AGORA);
    expect(alarme?.ligados).toEqual([{ classe: "AudioFixer", desde: new Date(AGORA.getTime() - 45 * MIN).toISOString(), em: AGORA.toISOString() }]);
    expect(await destruido("ocioso")).toBe(true);
    expect(await guardado()).toEqual(alarme);

    const admin = await cookie();
    expect(await (await call(new Request(`${SITE}/`, { headers: { cookie: admin } }))).text()).toContain(ERROS.servicoLigado);

    // Parado, ele some do painel; o aviso fica por um dia.
    expect((await vigiar(painel({}, AGORA.getTime() + 13 * MIN), vigiados("ocioso"), new Db(env.DB), new Date(AGORA.getTime() + 15 * MIN)))?.ligados).toHaveLength(1);
    expect(await vigiar(painel({}, AGORA.getTime() + 26 * 60 * MIN - 2 * MIN), vigiados("ocioso"), new Db(env.DB), new Date(AGORA.getTime() + 26 * 60 * MIN))).toEqual({ ligados: [] });
    expect(await guardado()).toBeNull();
  });

  it("Dispensar tira o banner até a próxima parada; o registro fica para o painel", async () => {
    await vigiar(painel({ "app-audio": ligado(45) }), vigiados("dispensar"), new Db(env.DB), AGORA);
    const admin = await cookie();
    const home = async () => (await (await call(new Request(`${SITE}/`, { headers: { cookie: admin } }))).text());
    expect(await home()).toContain('action="/alarme/dispensar"');

    // Quem não é administrador nem chega à ação.
    const outro = await memberCookie();
    expect((await call(postForm("/alarme/dispensar", {}, { cookie: outro }))).status).toBe(404);
    expect((await guardado())?.dispensado).toBeUndefined();

    const res = await call(postForm("/alarme/dispensar", {}, { cookie: admin }));
    expect(res.status).toBe(303);
    expect(await home()).not.toContain(ERROS.servicoLigado);
    expect((await guardado())?.ligados).toHaveLength(1);

    // A rodada seguinte, sem parada nova, não traz o banner de volta.
    await vigiar(painel({}, AGORA.getTime() + 13 * MIN), vigiados("dispensar"), new Db(env.DB), new Date(AGORA.getTime() + 15 * MIN));
    expect(await home()).not.toContain(ERROS.servicoLigado);
  });

  it("o painel atrasado mostra ligado, mas o contêiner já dormiu sozinho: nenhum aviso", async () => {
    // Como em 06 e 07/11/2026: 35 min de busca de rosto, um pedido por minuto, e o contêiner dormiu.
    const nome = "dormiu";
    await runInDurableObject(env.TESTE_CONTEINER.getByName(nome), (_, state) => void ((state.container as unknown as { running: boolean }).running = false));
    expect(await vigiar(painel({ "app-audio": ligado(38, 8) }), vigiados(nome), new Db(env.DB), AGORA)).toEqual({ ligados: [] });
    expect(await guardado()).toBeNull();
    expect(await destruido(nome)).toBe(false);
  });

  it("a hora do último pedido sobrevive ao despejo do Durable Object", async () => {
    const nome = "despejado";
    await env.TESTE_CONTEINER.getByName(nome).configurar(60 * MIN, "1h", 10_000, true);
    // Despejado, o objeto volta com a memória zerada; a hora fica no armazenamento.
    await runInDurableObject(env.TESTE_CONTEINER.getByName(nome), (obj) => void Object.assign(obj, { lastRequestAt: 0, inflightRequests: 0 }));
    expect(await env.TESTE_CONTEINER.getByName(nome).pararSeOcioso(LIMITE_MS)).toBe("trabalhando");
    expect(await destruido(nome)).toBe(false);
  });

  it("ligado há menos que o limite, ou desligado há tempo: nenhum aviso", async () => {
    expect(await vigiar(painel({ "app-audio": ligado(20) }), vigiados("curto"), new Db(env.DB), AGORA)).toEqual({ ligados: [] });
    expect(await vigiar(painel({ "app-audio": ligado(90, 40) }), vigiados("antigo"), new Db(env.DB), AGORA)).toEqual({ ligados: [] });
  });

  it("painel atrasado (Worker sem dados recentes): não conclui nada", async () => {
    expect(await vigiar(painel({ "app-audio": ligado(60, 30) }, AGORA.getTime() - 30 * MIN), vigiados("atrasado"), new Db(env.DB), AGORA)).toBeNull();
    expect(await destruido("atrasado")).toBe(false);
  });

  it("sem o token do painel: o administrador vê que o alarme não vigia", async () => {
    await vigiar(null, vigiados("sem-token"), new Db(env.DB), AGORA);
    const admin = await cookie();
    expect(await (await call(new Request(`${SITE}/`, { headers: { cookie: admin } }))).text()).toContain(ERROS.alarmeSemPainel);
  });

  it("painel que falha: o log diz o código e o que a Cloudflare respondeu, mesmo sem JSON", async () => {
    const erros: string[] = [];
    const antes = console.error;
    console.error = (...a: unknown[]) => void erros.push(a.map(String).join(" "));
    try {
      const negado = async () => Response.json({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, { status: 403 });
      await vigiar(new Painel("token", "conta", negado as typeof fetch), vigiados("negado"), new Db(env.DB), AGORA);
      const html = async () => new Response("<html>error code: 1010</html>", { status: 403 });
      await vigiar(new Painel("token", "conta", html as typeof fetch), vigiados("html"), new Db(env.DB), AGORA);
    } finally {
      console.error = antes;
    }
    expect(erros[0]).toContain('HTTP 403): [{"code":10000,"message":"Authentication error"}]');
    expect(erros[1]).toContain("HTTP 403, resposta que não é JSON): <html>error code: 1010</html>");
    expect((await guardado())?.semPainel).toBe(true);
  });

  it("o fetch de verdade é chamado solto, não como método do painel", async () => {
    // No Worker, o fetch chamado com outro this falha antes de sair ("Illegal invocation"): foi o que
    // derrubou o alarme no ar. O falso aqui recusa do mesmo jeito.
    const original = globalThis.fetch;
    let chamadas = 0;
    globalThis.fetch = function (this: unknown, url: RequestInfo | URL) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      chamadas++;
      if (String(url).endsWith("/containers/applications")) return Promise.resolve(Response.json({ success: true, result: APPS }));
      return Promise.resolve(Response.json({ data: { viewer: { accounts: [{ containersUsageAdaptiveGroups: [], workersInvocationsAdaptive: [{ dimensions: { datetimeMinute: "2026-11-03T11:58:00Z" } }] }] } } }));
    } as typeof fetch;
    try {
      // Os dois caminhos: o padrão do painel e o do agendamento, que passa o fetch do site.
      for (const p of [new Painel("token", "conta"), new Painel("token", "conta", fetch)]) {
        expect((await p.aplicacoes()).get("meu-avatar-renderer")).toBe("app-render");
        expect((await p.uso(new Date(AGORA.getTime() - 60 * MIN), AGORA)).workerAte).toBe(Date.parse("2026-11-03T11:58:00Z"));
      }
      await vigiaConteineres({ ...env, CLOUDFLARE_ANALYTICS_TOKEN: "token", CLOUDFLARE_ACCOUNT_ID: "conta" } as unknown as Env)();
      expect(chamadas).toBe(6);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("minutos pulados no painel contam como o mesmo período ligado", () => {
    const t = (m: number) => AGORA.getTime() - m * MIN;
    expect(ligadoDesde([t(50), t(46), t(42), t(5)], t(2))).toBe(t(5));
    expect(ligadoDesde([t(50), t(46), t(42), t(38)], t(2))).toBeNull();
    expect(ligadoDesde([t(40), t(37), t(33), t(30)], t(28))).toBe(t(40));
    expect(LIMITE_MS).toBe(30 * MIN);
  });
});
