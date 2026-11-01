/**
 * Base dos contêineres do site (AudioFixer e Exporter). Em out/2026 os dois do
 * Exporter (8 GiB cada) e o AudioFixer ficaram ligados dia e noite sem trabalho, por
 * dois motivos que esta base cobre:
 *
 * - Para dormir, a biblioteca só manda SIGTERM, e o Python como PID 1 o ignorava
 *   (os servidores em container/ agora tratam o sinal). Se o contêiner seguir ligado
 *   depois do SIGTERM, a próxima volta do alarme o derruba com SIGKILL.
 * - O `sleepAfter` só conta quando não há pedido em andamento, e um pedido só termina
 *   quando o corpo da resposta é lido até o fim. Um pedido que passa do prazo do
 *   próprio trabalho conta como abandonado (a tela fechou, o Worker caiu).
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
  protected abstract maxRequestMs: number;
  /** Quanto o contêiner tem para sair depois do SIGTERM, antes do SIGKILL. */
  protected stopGraceMs = 10_000;
  private lastRequestAt = 0;
  private stopSentAt = 0;

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

  /** Prazo vencido: SIGTERM; se na volta seguinte ainda estiver ligado, SIGKILL. */
  override async onActivityExpired(): Promise<void> {
    if (!this.ctx.container?.running) return;
    if (this.stopSentAt && Date.now() - this.stopSentAt > this.stopGraceMs) {
      console.error(`Contêiner seguiu ligado ${Math.round((Date.now() - this.stopSentAt) / 1000)} s depois do SIGTERM: forçando a parada.`);
      this.stopSentAt = 0;
      await this.destroy();
      return;
    }
    this.stopSentAt ||= Date.now();
    await this.stop();
  }

  override onStart(): void {
    this.stopSentAt = 0;
  }

  override onStop(): void {
    this.stopSentAt = 0;
  }
}
