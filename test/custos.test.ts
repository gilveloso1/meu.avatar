import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { type CustosApi, type CustosExternos, CustosReais, lerHeyGen, lerOpenRouter } from "../src/custos";
import { ERROS } from "../src/erros";
import { handle } from "../src/index";
import { Painel } from "../src/vigia";
import { cookie, FakeVideoApi, memberCookie, SITE } from "./helpers";

/** Um fetch de mentira: responde pelo endereço e guarda os pedidos. */
function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = Object.keys(routes).find((r) => url.startsWith(r));
    return route ? routes[route]!(init) : new Response("não achei", { status: 404 });
  }) as typeof fetch;
  return { doFetch, calls };
}

const GIB = 1024 ** 3;

describe("custos de fora", () => {
  it("OpenRouter: uso do mês e de hoje e o que resta do limite da chave", async () => {
    const { doFetch, calls } = fakeFetch({
      "https://openrouter.ai/api/v1/key": () => Response.json({ data: { usage_daily: 1.5, usage_monthly: 12, limit_remaining: 38 } }),
    });
    expect(await lerOpenRouter("chave", doFetch)).toEqual({
      saldo: { valor: 38, moeda: "usd" },
      mes: { valor: 12, moeda: "usd" },
      hoje: { valor: 1.5, moeda: "usd" },
    });
    expect(new Headers(calls[0]!.init!.headers).get("authorization")).toBe("Bearer chave");
  });

  it("HeyGen: a carteira em dólares ou em créditos, e o plano por uso", async () => {
    const carteira = fakeFetch({
      "https://api.heygen.com/v3/users/me": () => Response.json({ data: { billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 22.65 }, subscription: null, usage_based: null } }),
    });
    expect(await lerHeyGen("k", carteira.doFetch)).toEqual({ saldo: { valor: 22.65, moeda: "usd" }, mes: null, hoje: null });
    expect(new Headers(carteira.calls[0]!.init!.headers).get("x-api-key")).toBe("k");

    const porUso = fakeFetch({
      "https://api.heygen.com/v3/users/me": () =>
        Response.json({ data: { billing_type: "usage_based", wallet: null, subscription: null, usage_based: { spending_current_usd: 7, remaining_credits: 100 } } }),
    });
    expect(await lerHeyGen("k", porUso.doFetch)).toEqual({ saldo: { valor: 100, moeda: "creditos" }, mes: { valor: 7, moeda: "usd" }, hoje: null });
  });

  it("cada provedor falha sozinho, e sem chave não chama a API", async () => {
    let chamado = false;
    const custos = await new CustosReais(
      [
        { nome: "Sem chave", chave: undefined, ler: async () => ((chamado = true), { saldo: null, mes: null, hoje: null }) },
        { nome: "Quebrado", chave: "k", ler: async () => Promise.reject(new Error("fora do ar")) },
        { nome: "Bom", chave: "k", ler: async () => ({ saldo: { valor: 5, moeda: "usd" }, mes: null, hoje: null }) },
      ],
      null,
      "meu-avatar",
    ).custos(30);
    expect(chamado).toBe(false);
    expect(custos.provedores.map((p) => [p.nome, p.estado])).toEqual([
      ["Sem chave", "sem_chave"],
      ["Quebrado", "falhou"],
      ["Bom", "ok"],
    ]);
    expect(custos.cloudflare).toBeNull();
  });

  it("Cloudflare: o custo de cada contêiner do site, o R2 no período e no máximo 30 dias", async () => {
    let variaveis: Record<string, string> = {};
    const { doFetch } = fakeFetch({
      "https://api.cloudflare.com/client/v4/accounts/conta/containers/applications": () =>
        Response.json({ success: true, result: [{ id: "a1", name: "meu-avatar-exporter" }, { id: "a2", name: "meu-avatar-audiofixer" }, { id: "a3", name: "outro-site" }] }),
      "https://api.cloudflare.com/client/v4/graphql": (init) => {
        variaveis = JSON.parse(String(init!.body)).variables;
        return Response.json({
          data: {
            viewer: {
              accounts: [
                {
                  containersUsageAdaptiveGroups: [
                    // 1 GiB por 1 h e 60 s de CPU: 3600 × 0,0000025 + 60 × 0,00002 = US$ 0,0102.
                    { dimensions: { applicationId: "a2" }, sum: { allocatedMemory: GIB * 3600, allocatedDisk: 0, cpuTimeSec: 60 } },
                    // 8 GiB por 1 h: US$ 0,072.
                    { dimensions: { applicationId: "a1" }, sum: { allocatedMemory: 8 * GIB * 3600, allocatedDisk: 0, cpuTimeSec: 0 } },
                    { dimensions: { applicationId: "a3" }, sum: { allocatedMemory: 99 * GIB * 3600, allocatedDisk: 0, cpuTimeSec: 0 } },
                  ],
                  r2StorageAdaptiveGroups: [{ max: { payloadSize: 2e9, objectCount: 40 } }],
                },
              ],
            },
          },
        });
      },
    });
    const agora = new Date("2026-11-04T12:00:00Z");
    const custos = await new CustosReais([], new Painel("token", "conta", doFetch), "meu-avatar").custos(null, agora);
    const cf = custos.cloudflare as Exclude<CustosExternos["cloudflare"], null | "falhou">;
    expect(cf.dias).toBe(30);
    expect(variaveis.desde).toBe("2026-10-05T12:00:00.000Z");
    expect(variaveis.bucket).toBe("meu-avatar");
    expect(cf.servicos.map((s) => s.nome)).toEqual(["Exportação", "Armazenamento", "Áudio"]);
    expect(cf.servicos.find((s) => s.nome === "Exportação")!.custo).toBeCloseTo(0.072, 6);
    expect(cf.servicos.find((s) => s.nome === "Áudio")!.custo).toBeCloseTo(0.0102, 6);
    // 2 GB por 30 dias: 2 × 0,015.
    expect(cf.servicos.find((s) => s.nome === "Armazenamento")!.custo).toBeCloseTo(0.03, 6);
    expect(cf.memoriaGiBHoras).toBeCloseTo(9, 6);
    expect(cf.r2Bytes).toBe(2e9);
  });

  it("o painel da Cloudflare fora do ar não derruba o resto", async () => {
    const { doFetch } = fakeFetch({ "https://api.cloudflare.com": () => new Response("<html>erro</html>", { status: 502 }) });
    const custos = await new CustosReais([], new Painel("token", "conta", doFetch), "meu-avatar").custos(7);
    expect(custos.cloudflare).toBe("falhou");
  });
});

describe("aba Custos com a infraestrutura", () => {
  const custosFalsos = (custos: CustosExternos): CustosApi & { pedidos: (number | null)[] } => {
    const pedidos: (number | null)[] = [];
    return { pedidos, custos: async (dias) => (pedidos.push(dias), custos) };
  };
  const get = (path: string, session: string, costs: CustosApi) =>
    handle(new Request(`${SITE}${path}`, { headers: { cookie: session } }), { ...env, SITE_URL: SITE }, { api: new FakeVideoApi(), costs });

  it("mostra um card por provedor, a Cloudflare e o aviso sem acesso", async () => {
    const admin = await cookie();
    const costs = custosFalsos({
      provedores: [
        { nome: "OpenRouter", estado: "ok", saldo: { valor: 38, moeda: "usd" }, mes: { valor: 12, moeda: "usd" }, hoje: null },
        { nome: "HeyGen", estado: "sem_chave", saldo: null, mes: null, hoje: null },
      ],
      cloudflare: null,
    });
    const page = await (await get("/painel/custos?periodo=7", admin, costs)).text();
    expect(costs.pedidos).toEqual([7]);
    expect(page).toContain(">OpenRouter<");
    expect(page).toContain("US$ 38,00");
    expect(page).toContain(">HeyGen<");
    expect(page).toContain("Sem chave no site");
    expect(page).toContain(ERROS.custosSemAcesso);
  });

  it("com o painel lido, mostra os serviços e os totais", async () => {
    const admin = await cookie();
    const costs = custosFalsos({
      provedores: [],
      cloudflare: { dias: 30, memoriaGiBHoras: 9, cpuMinutos: 1, r2Bytes: 2e9, servicos: [{ nome: "Exportação", tipo: "conteiner", detalhe: "8 GiB·h · 0 min de CPU", custo: 0.072 }] },
    });
    const page = await (await get("/painel/custos?periodo=tudo", admin, costs)).text();
    expect(costs.pedidos).toEqual([null]);
    expect(page).toContain(">Exportação<");
    expect(page).toContain("Últimos 30 dias");
  });

  it("a Visão geral não consulta os custos de fora, e quem não é administrador não vê nada", async () => {
    const costs = custosFalsos({ provedores: [], cloudflare: null });
    expect((await get("/painel", await cookie(), costs)).status).toBe(200);
    expect(costs.pedidos).toEqual([]);
    expect((await get("/painel/custos", await memberCookie(), costs)).status).toBe(404);
    expect(costs.pedidos).toEqual([]);
  });
});
