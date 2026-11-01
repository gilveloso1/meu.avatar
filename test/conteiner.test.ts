import { describe, expect, it } from "vitest";
import { abandoned } from "../src/conteiner";

describe("contêiner que dorme", () => {
  const min = 60_000;
  it("sem pedido em andamento, nada a desligar", () => {
    expect(abandoned(0, 0, 60 * min, 15 * min)).toBe(false);
  });
  it("pedido dentro do prazo do trabalho segue", () => {
    expect(abandoned(1, 0, 14 * min, 15 * min)).toBe(false);
  });
  it("pedido que passou do prazo conta como abandonado", () => {
    expect(abandoned(1, 0, 16 * min, 15 * min)).toBe(true);
  });
});
