/**
 * Ponto de entrada dos testes: o Worker do site e, a mais, um Durable Object de
 * contêiner com o armazenamento e o alarme de verdade do workerd. Só o contêiner é
 * falso (o de verdade precisa de Docker): está ligado, ignora o SIGTERM e responde com
 * um corpo que nunca termina, como uma resposta que o Worker abandonou
 * (test/conteiner.test.ts).
 */
import { SleepyContainer } from "../src/conteiner";

// A biblioteca procura este export quando o Durable Object nasce com o contêiner já ligado.
export { ContainerProxy } from "@cloudflare/containers";
export * from "../src/index";
export { default } from "../src/index";

/** O contêiner falso: guarda os sinais e ignora o SIGTERM, como o Python como PID 1 fazia. */
export interface Falso {
  running: boolean;
  sinais: number[];
  destruido: boolean;
}

export class TesteConteiner extends SleepyContainer {
  defaultPort = 8080;
  sleepAfter = "1h";
  maxRequestMs = 60 * 60_000;

  constructor(ctx: DurableObjectState<{}>, env: Cloudflare.Env) {
    const falso = {
      running: true,
      sinais: [] as number[],
      destruido: false,
      signal: (n: number) => void falso.sinais.push(n),
      destroy: async () => {
        falso.destruido = true;
        falso.running = false;
      },
      start: () => {},
      monitor: () => new Promise(() => {}),
      getTcpPort: () => ({ fetch: async () => new Response(new ReadableStream({ pull: () => new Promise(() => {}) })) }),
    };
    Object.defineProperty(ctx, "container", { value: falso });
    super(ctx, env);
  }

  /** O que o alarme da biblioteca fez com o contêiner. */
  falso(): Falso {
    const { running, sinais, destruido } = this.ctx.container as unknown as Falso;
    return { running, sinais, destruido };
  }

  /** Ajusta os prazos e, se pedido, faz um pedido cujo corpo ninguém lê. */
  async configurar(maxRequestMs: number, sleepAfter: string, stopGraceMs: number, pedido: boolean): Promise<void> {
    this.maxRequestMs = maxRequestMs;
    this.sleepAfter = sleepAfter;
    this.stopGraceMs = stopGraceMs;
    this.renewActivityTimeout();
    if (pedido) await this.containerFetch(new Request("http://conteiner/trabalho"), 8080);
  }
}
