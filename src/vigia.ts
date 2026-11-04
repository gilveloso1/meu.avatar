/**
 * Alarme de contêiner ligado sem trabalho. De 26/10 a 01/11/2026 o AudioFixer e o Exporter
 * ficaram ligados dia e noite sem que ninguém visse (docs/operacao.md, "Contêiner que dorme de
 * verdade"). A cada 15 min, o agendamento lê no painel da Cloudflare (GraphQL Analytics,
 * `containersUsageAdaptiveGroups`) os minutos com memória alocada de cada contêiner e compara
 * com o trabalho de verdade: o que o banco tem em andamento e o último pedido que o Durable
 * Object recebeu.
 *
 * - Painel sem linhas quer dizer desligado; só linhas recentes com memória alocada contam.
 * - O painel chega com minutos de atraso: só vale se as invocações do Worker, na mesma
 *   consulta, estiverem em dia. Sem isso, a rodada não conclui nada.
 * - Ligado sem trabalho há mais de LIMITE_MS: console.error, a parada à força do contêiner e o
 *   aviso ao administrador (banner na página Modelos, pela config 'alarme.conteiner', por um dia).
 */
import type { Db } from "./db";

/** Quanto um contêiner pode ficar com memória alocada sem trabalho. */
export const LIMITE_MS = 30 * 60_000;
/** Minutos sem linha que ainda contam como o mesmo período ligado (o painel pula minutos). */
const FOLGA_MS = 5 * 60_000;
/** A última linha do contêiner tem de estar a até isso das invocações do Worker, senão ele já desligou. */
const RECENTE_MS = 10 * 60_000;
/** As invocações do Worker mais novas que isso dizem que o painel está em dia (o cron roda a cada minuto). */
const EM_DIA_MS = 15 * 60_000;
/** Quanto do painel ler: o limite e mais uma sobra para achar o começo do período ligado. */
const JANELA_MS = 3 * LIMITE_MS;
/** Quanto o banner do administrador segue mostrando um contêiner que já foi parado. */
const AVISO_MS = 24 * 60 * 60_000;

const API = "https://api.cloudflare.com/client/v4";
const WORKER = "meu-avatar";

/** Um contêiner vigiado: a classe (o nome da aplicação é `meu-avatar-<classe>`) e o que só o site sabe dele. */
export interface Vigiado {
  classe: string;
  /** Há trabalho dele em andamento no banco (áudio, edição rápida, exportação). */
  trabalhoNoBanco(): Promise<boolean>;
  /** Pergunta ao Durable Object; se nenhum pedido chegou há `limiteMs`, para o contêiner. */
  pararSeOcioso(limiteMs: number): Promise<"trabalhando" | "parado">;
}

/** O que fica guardado para o banner do administrador. */
export interface Alarme {
  /** Contêineres ligados sem trabalho e desde quando (ISO). */
  ligados: { classe: string; desde: string; em: string }[];
  /** O painel não respondeu (sem token, sem permissão): o alarme não está vigiando. */
  semPainel?: boolean;
}

export const CHAVE = "alarme.conteiner";

/** Minutos com memória alocada de cada aplicação e o minuto mais novo das invocações do Worker. */
export interface Uso {
  minutos: Map<string, number[]>;
  workerAte: number | null;
}

/**
 * O corpo da resposta da Cloudflare, ou o erro com o motivo por escrito: o código HTTP e o começo
 * do corpo, mesmo quando ele não é JSON. O log guardava só a pilha, sem o motivo.
 */
async function corpo<T>(res: Response, oQue: string): Promise<T> {
  const texto = await res.text();
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(`${oQue} falhou (HTTP ${res.status}, resposta que não é JSON): ${texto.slice(0, 300)}`);
  }
}

export class Painel {
  constructor(
    private readonly token: string,
    private readonly conta: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  /** As aplicações de contêiner da conta: nome → id. */
  async aplicacoes(): Promise<Map<string, string>> {
    const res = await this.doFetch(`${API}/accounts/${this.conta}/containers/applications`, { headers: { authorization: `Bearer ${this.token}` } });
    const body = await corpo<{ success?: boolean; result?: { id: string; name: string }[]; errors?: unknown }>(res, "Lista de contêineres");
    if (!res.ok || !body.result) throw new Error(`Lista de contêineres falhou (HTTP ${res.status}): ${JSON.stringify(body.errors)}`);
    return new Map(body.result.map((a) => [a.name, a.id]));
  }

  async uso(desde: Date, ate: Date): Promise<Uso> {
    const query = `query ($conta: String!, $desde: Time!, $ate: Time!, $worker: String!) {
  viewer { accounts(filter: {accountTag: $conta}) {
    containersUsageAdaptiveGroups(limit: 10000, filter: {datetimeMinute_geq: $desde, datetimeMinute_leq: $ate}, orderBy: [datetimeMinute_ASC]) {
      dimensions { applicationId datetimeMinute } sum { allocatedMemory }
    }
    workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $desde, datetime_leq: $ate, scriptName: $worker}, orderBy: [datetimeMinute_DESC]) {
      dimensions { datetimeMinute }
    }
  } }
}`;
    const res = await this.doFetch(`${API}/graphql`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { conta: this.conta, desde: desde.toISOString(), ate: ate.toISOString(), worker: WORKER } }),
    });
    type Linha = { dimensions: { applicationId?: string; datetimeMinute: string }; sum?: { allocatedMemory: number } };
    const body = await corpo<{ data?: { viewer: { accounts: { containersUsageAdaptiveGroups: Linha[]; workersInvocationsAdaptive: Linha[] }[] } }; errors?: unknown }>(res, "Painel da Cloudflare");
    const conta = body.data?.viewer.accounts[0];
    if (!res.ok || !conta) throw new Error(`Painel da Cloudflare falhou (HTTP ${res.status}): ${JSON.stringify(body.errors)}`);
    const minutos = new Map<string, number[]>();
    for (const l of conta.containersUsageAdaptiveGroups) {
      if (!l.dimensions.applicationId || !(l.sum?.allocatedMemory! > 0)) continue;
      const lista = minutos.get(l.dimensions.applicationId) ?? [];
      lista.push(Date.parse(l.dimensions.datetimeMinute));
      minutos.set(l.dimensions.applicationId, lista);
    }
    const w = conta.workersInvocationsAdaptive[0];
    return { minutos, workerAte: w ? Date.parse(w.dimensions.datetimeMinute) : null };
  }
}

/** Desde quando o contêiner está ligado sem parar, se a última linha é recente; senão, null (desligado). */
export function ligadoDesde(minutos: number[], workerAte: number): number | null {
  const m = [...minutos].sort((a, b) => a - b);
  const ultimo = m.at(-1);
  if (ultimo === undefined || workerAte - ultimo > RECENTE_MS) return null;
  let desde = ultimo;
  for (let i = m.length - 2; i >= 0 && desde - m[i]! <= FOLGA_MS; i--) desde = m[i]!;
  return desde;
}

/**
 * Uma rodada do alarme. Devolve o que achou (null: o painel não está em dia, nada concluído)
 * e guarda no banco o que o banner do administrador mostra.
 */
export async function vigiar(painel: Painel | null, vigiados: Vigiado[], db: Db, agora = new Date()): Promise<Alarme | null> {
  if (!painel) {
    console.error("Alarme de contêiner sem o token do painel (CLOUDFLARE_ANALYTICS_TOKEN): nada é vigiado.");
    return guardar(db, { ligados: [], semPainel: true }, agora);
  }
  let apps: Map<string, string>;
  let uso: Uso;
  try {
    [apps, uso] = await Promise.all([painel.aplicacoes(), painel.uso(new Date(agora.getTime() - JANELA_MS), agora)]);
  } catch (err) {
    // O motivo vai no texto: passado como objeto, o log da Cloudflare guardava só a pilha.
    console.error(`Alarme de contêiner: o painel não respondeu. ${err instanceof Error ? err.message : String(err)}`);
    return guardar(db, { ligados: [], semPainel: true }, agora);
  }
  if (uso.workerAte === null || agora.getTime() - uso.workerAte > EM_DIA_MS) {
    console.log("Alarme de contêiner: painel atrasado, nada a concluir nesta rodada.");
    return null;
  }
  const ligados: Alarme["ligados"] = [];
  for (const v of vigiados) {
    const id = apps.get(`${WORKER}-${v.classe.toLowerCase()}`);
    if (!id) {
      console.error(`Alarme de contêiner: a aplicação de ${v.classe} não está na conta.`);
      continue;
    }
    const desde = ligadoDesde(uso.minutos.get(id) ?? [], uso.workerAte);
    if (desde === null || uso.workerAte - desde < LIMITE_MS) continue;
    if (await v.trabalhoNoBanco()) continue;
    if ((await v.pararSeOcioso(LIMITE_MS)) === "trabalhando") continue;
    const min = Math.round((uso.workerAte - desde) / 60_000);
    console.error(`Contêiner ${v.classe} com memória alocada há ${min} min sem trabalho: parado à força. Confira o painel e os logs.`);
    ligados.push({ classe: v.classe, desde: new Date(desde).toISOString(), em: agora.toISOString() });
  }
  return guardar(db, { ligados }, agora);
}

/** O aviso fica por AVISO_MS depois da última vez que o contêiner foi achado ligado: parado à força, ele some do painel. */
async function guardar(db: Db, novo: Alarme, agora: Date): Promise<Alarme> {
  const antes = await db.alarm<Alarme>(CHAVE);
  const ainda = (antes?.ligados ?? []).filter((a) => !novo.ligados.some((n) => n.classe === a.classe) && agora.getTime() - Date.parse(a.em) < AVISO_MS);
  const alarme: Alarme = { ligados: [...novo.ligados, ...ainda], ...(novo.semPainel ? { semPainel: true } : {}) };
  await db.setAlarm(CHAVE, alarme.ligados.length || alarme.semPainel ? alarme : null);
  return alarme;
}
