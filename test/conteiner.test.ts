/**
 * A guarda de src/conteiner.ts lê e zera campos privados da biblioteca
 * @cloudflare/containers. Aqui roda o código de verdade dela (o alarme que decide
 * desligar), num Durable Object de verdade, só com o contêiner falso (test/worker.ts):
 * se uma versão nova mudar os campos ou o alarme, o teste falha em vez de os
 * contêineres voltarem a ficar ligados sem aviso.
 */
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { abandoned } from "../src/conteiner";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera o alarme da biblioteca decidir desligar, até o prazo. */
async function expires(name: string, maxRequestMs: number, sleepAfter: string, waitMs: number): Promise<boolean> {
  const stub = env.TESTE_CONTEINER.getByName(name);
  await stub.abandonar(maxRequestMs, sleepAfter);
  for (const end = Date.now() + waitMs; Date.now() < end; await sleep(100)) {
    if (await runInDurableObject(stub, (obj) => obj.expired)) return true;
  }
  return false;
}

describe("contêiner que dorme", () => {
  it("resposta abandonada não segura o contêiner ligado", async () => {
    expect(await expires("abandonado", 50, "1h", 5000)).toBe(true);
  });

  it("pedido dentro do prazo do trabalho mantém o contêiner ligado", async () => {
    // Sem a guarda, a biblioteca segura o contêiner enquanto o corpo não termina, mesmo com o sleepAfter vencido.
    expect(await expires("trabalhando", 60 * 60_000, "1s", 3000)).toBe(false);
  });

  it("a regra do prazo", () => {
    const min = 60_000;
    expect(abandoned(0, 0, 60 * min, 15 * min)).toBe(false);
    expect(abandoned(1, 0, 14 * min, 15 * min)).toBe(false);
    expect(abandoned(1, 0, 16 * min, 15 * min)).toBe(true);
  });
});
