/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { ERROS, PARTES } from "../src/erros";

// O código-fonte, para procurar frase de erro solta fora do catálogo.
const SOURCES = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });
const SITE_SOURCE = SOURCES["../src/site/site.ts"]!;

/** Cada frase do catálogo; as que têm valor (tamanho, data) saem com um exemplo. */
const FRASES = Object.entries(ERROS).map(([chave, v]) => [chave, typeof v === "function" ? (v as (...a: unknown[]) => string)(10, 500) : v] as const);

/** Termos técnicos ou de quem desenvolve: nunca na tela. */
const PROIBIDOS = /contêiner|container|servidor|\bAPI\b|OpenRouter|HeyGen|\bWan\b|\bR2\b|HTTP|código|inválid|\berro\b|falhou|ilegíve/i;

describe("catálogo de erros", () => {
  it.each(FRASES)("%s segue o molde", (_chave, texto) => {
    const partes = PARTES.get(texto);
    expect(partes, "use erro() ou campo()").toBeDefined();
    for (const parte of partes!) {
      expect(parte).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].*\.$/);
      expect(parte.split(/\s+/).length, `"${parte}" passa de 10 palavras`).toBeLessThanOrEqual(10);
      expect(parte).not.toMatch(/!|^Erro/);
      expect(parte).not.toMatch(PROIBIDOS);
    }
    // "Toque em X": X é um botão que existe no site.
    for (const [, botao] of texto.matchAll(/Toque em (.+?)(?: para|\.)/g)) expect(SITE_SOURCE, `não há botão "${botao}"`).toContain(botao);
  });

  it("o mesmo texto não aparece em duas chaves", () => {
    const textos = FRASES.map(([, t]) => t);
    expect(new Set(textos).size).toBe(textos.length);
  });

  it("nenhuma frase de erro fica escrita fora do catálogo", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10);
    for (const [arquivo, fonte] of Object.entries(SOURCES)) {
      if (arquivo.endsWith("/erros.ts")) continue;
      expect(fonte, `${arquivo}: erro com texto solto; use ERROS`).not.toMatch(/new (InputError|ForbiddenError)\(\s*["'`]/);
      expect(fonte, `${arquivo}: { error: "..." }; use ERROS`).not.toMatch(/\{ error: ["'`]/);
      for (const [chave, texto] of FRASES) for (const parte of PARTES.get(texto)!) {
        expect(fonte.includes(parte), `${arquivo} repete "${parte}"; use ERROS.${chave}`).toBe(false);
      }
    }
  });
});
