/**
 * src/conteiner.ts usa campos privados e o alarme da biblioteca @cloudflare/containers.
 * Aqui roda o código de verdade dela, num Durable Object de verdade, só com o contêiner
 * falso (test/worker.ts): se uma versão nova mudar os campos ou o alarme, o teste falha
 * em vez de os contêineres voltarem a ficar ligados sem aviso.
 */
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { abandoned, tentando } from "../src/conteiner";
import type { Falso } from "./worker";

const SIGTERM = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Configura o contêiner e espera, até o prazo, o alarme fazer o que `pronto` pede. */
async function espera(name: string, cfg: [number, string, number, boolean], pronto: (f: Falso) => boolean, waitMs: number): Promise<Falso> {
  const stub = env.TESTE_CONTEINER.getByName(name);
  await stub.configurar(...cfg);
  let f = await runInDurableObject(stub, (obj) => obj.falso());
  for (const end = Date.now() + waitMs; !pronto(f) && Date.now() < end; await sleep(100)) f = await runInDurableObject(stub, (obj) => obj.falso());
  return f;
}

describe("contêiner que dorme", { timeout: 15_000 }, () => {
  it("resposta abandonada não segura o contêiner ligado", async () => {
    const f = await espera("abandonado", [50, "1h", 60_000, true], (f) => f.sinais.length > 0, 5000);
    expect(f.sinais).toContain(SIGTERM);
  });

  it("pedido dentro do prazo do trabalho mantém o contêiner ligado", async () => {
    // Sem a guarda, a biblioteca segura o contêiner enquanto o corpo não termina, mesmo com o sleepAfter vencido.
    const f = await espera("trabalhando", [60 * 60_000, "1s", 60_000, true], (f) => f.sinais.length > 0, 3000);
    expect(f.sinais).toEqual([]);
    expect(f.running).toBe(true);
  });

  it("contêiner que ignora o SIGTERM é parado à força", async () => {
    const f = await espera("teimoso", [60 * 60_000, "1s", 0, false], (f) => f.destruido, 8000);
    expect(f.sinais).toContain(SIGTERM);
    expect(f.destruido).toBe(true);
  });

  it("a regra do prazo", () => {
    const min = 60_000;
    expect(abandoned(0, 0, 60 * min, 15 * min)).toBe(false);
    expect(abandoned(1, 0, 14 * min, 15 * min)).toBe(false);
    expect(abandoned(1, 0, 16 * min, 15 * min)).toBe(true);
  });
});

describe("nova tentativa", () => {
  const falhando = (vezes: number, erro = new Error("The container service is unreachable")) => {
    let chamadas = 0;
    const fn = async () => {
      if (++chamadas <= vezes) throw erro;
      return "ok";
    };
    return { fn, chamadas: () => chamadas };
  };

  it("o contêiner que falha e depois responde passa sem o erro chegar a quem pediu", async () => {
    const f = falhando(2);
    expect(await tentando("Teste", f.fn, undefined, 0)).toBe("ok");
    expect(f.chamadas()).toBe(3);
  });

  it("desiste depois de três tentativas", async () => {
    const f = falhando(3);
    await expect(tentando("Teste", f.fn, undefined, 0)).rejects.toThrow("unreachable");
    expect(f.chamadas()).toBe(3);
  });

  it("o erro do próprio trabalho não se repete", async () => {
    const f = falhando(1, new TypeError("html quebrado"));
    await expect(tentando("Teste", f.fn, (err) => err instanceof TypeError, 0)).rejects.toThrow("html quebrado");
    expect(f.chamadas()).toBe(1);
  });
});
