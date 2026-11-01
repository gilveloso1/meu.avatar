/**
 * Ponto de entrada dos testes: o Worker do site e, a mais, um Durable Object de
 * contêiner com o armazenamento e o alarme de verdade do workerd. Só o contêiner é
 * falso (o de verdade precisa de Docker): está ligado e responde com um corpo que
 * nunca termina, como uma resposta que o Worker abandonou (test/conteiner.test.ts).
 */
import { SleepyContainer } from "../src/conteiner";

// A biblioteca procura este export quando o Durable Object nasce com o contêiner já ligado.
export { ContainerProxy } from "@cloudflare/containers";
export * from "../src/index";
export { default } from "../src/index";

export class TesteConteiner extends SleepyContainer {
  defaultPort = 8080;
  sleepAfter = "1h";
  maxRequestMs = 60 * 60_000;
  /** Quando o alarme da biblioteca decidiu desligar. */
  expired = false;

  constructor(ctx: DurableObjectState<{}>, env: Cloudflare.Env) {
    Object.defineProperty(ctx, "container", {
      value: {
        running: true,
        signal: () => {},
        destroy: async () => {},
        start: () => {},
        monitor: () => new Promise(() => {}),
        getTcpPort: () => ({ fetch: async () => new Response(new ReadableStream({ pull: () => new Promise(() => {}) })) }),
      },
    });
    super(ctx, env);
  }

  /** Ajusta os prazos e faz um pedido cujo corpo ninguém lê. */
  async abandonar(maxRequestMs: number, sleepAfter: string): Promise<void> {
    this.maxRequestMs = maxRequestMs;
    this.sleepAfter = sleepAfter;
    await this.containerFetch(new Request("http://conteiner/trabalho"), 8080);
  }

  override async onActivityExpired(): Promise<void> {
    this.expired = true;
  }
}
