/**
 * Base dos contêineres do site (AudioFixer e Exporter): o `sleepAfter` da biblioteca
 * só conta quando não há pedido em andamento, e um pedido só termina quando o corpo
 * da resposta é lido até o fim. Se o Worker abandona uma resposta no meio (a tela
 * fechou, o Worker caiu), a conta fica presa acima de zero e o contêiner nunca dorme:
 * em out/2026 os dois do Exporter (8 GiB cada) e o AudioFixer ficaram ligados dia e
 * noite sem trabalho. Aqui, um pedido que passa do prazo do próprio trabalho conta
 * como abandonado, e o contêiner dorme normalmente.
 */
import { Container } from "@cloudflare/containers";

/** Campos privados da biblioteca (0.3.x) que a guarda precisa ler e zerar. */
interface Internals {
  inflightRequests: number;
  sleepAfterMs: number;
}

/** Há pedido em andamento, mas o último começou há mais tempo do que um trabalho pode levar. */
export function abandoned(inflight: number, lastRequestAt: number, now: number, maxRequestMs: number): boolean {
  return inflight > 0 && now - lastRequestAt > maxRequestMs;
}

export abstract class SleepyContainer extends Container {
  /** Quanto um pedido pode durar; passado isso, a resposta foi abandonada. */
  protected abstract readonly maxRequestMs: number;
  private lastRequestAt = 0;

  override containerFetch(...args: Parameters<Container["containerFetch"]>): Promise<Response> {
    this.lastRequestAt = Date.now();
    return super.containerFetch(...args);
  }

  /**
   * A biblioteca chama isto a cada volta do alarme enquanto há pedido em andamento.
   * Com o pedido abandonado, zera a conta e marca o prazo como vencido: na volta
   * seguinte do alarme, o contêiner para.
   */
  override renewActivityTimeout(): void {
    super.renewActivityTimeout();
    const self = this as unknown as Internals;
    if (!abandoned(self.inflightRequests, this.lastRequestAt, Date.now(), this.maxRequestMs)) return;
    console.error(`Contêiner com ${self.inflightRequests} pedido(s) sem fim há mais de ${this.maxRequestMs / 60_000} min: desligando.`);
    self.inflightRequests = 0;
    self.sleepAfterMs = Date.now();
  }
}
