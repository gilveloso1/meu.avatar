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
import { call, cookie, SITE } from "./helpers";

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
    { classe: "Exporter", trabalhoNoBanco: () => db.exportWorking(), pararSeOcioso: async () => "parado" },
    { classe: "Renderer", trabalhoNoBanco: async () => false, pararSeOcioso: async () => "parado" },
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
    await env.DB.prepare("INSERT INTO videos (id, prompt, model, duration, resolution, aspect_ratio, status, created_at, updated_at, audio_status) VALUES ('v1', 'oi', 'm', 5, '480p', '9:16', 'completed', ?, ?, 'processing')")
      .bind(AGORA.toISOString(), AGORA.toISOString())
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

  it("minutos pulados no painel contam como o mesmo período ligado", () => {
    const t = (m: number) => AGORA.getTime() - m * MIN;
    expect(ligadoDesde([t(50), t(46), t(42), t(5)], t(2))).toBe(t(5));
    expect(ligadoDesde([t(50), t(46), t(42), t(38)], t(2))).toBeNull();
    expect(ligadoDesde([t(40), t(37), t(33), t(30)], t(28))).toBe(t(40));
    expect(LIMITE_MS).toBe(30 * MIN);
  });
});
