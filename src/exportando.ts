/**
 * A exportação anda no servidor, fora do pedido de quem a acompanha. Cada passo (a animação no
 * contêiner de render, um trecho, a emenda) leva de segundos a mais de um minuto, e o Worker para
 * junto quando quem pediu desiste: o MCP corta em 60 s, e o passo ficava preso por 15 min
 * (STALE_MS) até o agendamento retomar, enquanto o agente começava outra exportação. Aqui cada
 * exportação tem um Durable Object que dá os passos pelo alarme (até 15 min por vez, sem conexão
 * nenhuma); a tela e o acompanhar_exportacao só leem o andamento.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { createExports } from "./index";

/** Quem dá os passos fora do pedido (os testes dão no próprio pedido, sem ele). */
export interface ExportRunner {
  start(exportId: string): Promise<void>;
}

/** Depois disso, não começa outro passo neste alarme: o seguinte continua (o alarme vai até 15 min). */
const BUDGET_MS = 10 * 60 * 1000;
/** Outro pedido está no passo (o agendamento): pergunta de novo depois disso. */
const WAIT_MS = 20 * 1000;

export class ExportMaker extends DurableObject<Env> {
  async start(exportId: string): Promise<void> {
    if ((await this.ctx.storage.get<string>("export")) === exportId && (await this.ctx.storage.getAlarm()) !== null) return;
    await this.ctx.storage.put("export", exportId);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    const id = await this.ctx.storage.get<string>("export");
    if (!id) return;
    const exports = createExports(this.env);
    const end = Date.now() + BUDGET_MS;
    let row = await exports.advance(id);
    // Passo dado (ou falho, que tenta de novo até MAX_TRIES): segue para o próximo.
    while (row?.status === "running" && row.claimed_at === null && Date.now() < end) row = await exports.advance(id);
    if (row?.status === "running") await this.ctx.storage.setAlarm(Date.now() + (row.claimed_at === null ? 0 : WAIT_MS));
    else await this.ctx.storage.deleteAll();
  }
}

/** Um Durable Object por exportação: várias andam ao mesmo tempo. */
export class DurableExports implements ExportRunner {
  constructor(private readonly ns: DurableObjectNamespace<ExportMaker>) {}

  start(exportId: string): Promise<void> {
    return this.ns.get(this.ns.idFromName(exportId)).start(exportId);
  }
}
