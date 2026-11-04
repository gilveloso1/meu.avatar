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
  it("OpenRouter: o saldo e o gasto da conta pela chave de gestão; o limite da chave à parte", async () => {
    // O caso real de 04/11/2026: limite de US$ 50 por semana na chave, US$ 35,03 gastos na conta.
    const { doFetch, calls } = fakeFetch({
      "https://openrouter.ai/api/v1/key": () => Response.json({ data: { usage: 35.03, limit: 50, limit_remaining: 50, limit_reset: "weekly" } }),
      "https://openrouter.ai/api/v1/credits": () => Response.json({ data: { total_credits: 60, total_usage: 35.03 } }),
    });
    const leitura = await lerOpenRouter("chave", doFetch, "gestao");
    expect(leitura.saldo!.valor).toBeCloseTo(24.97, 6);
    expect(leitura.total).toEqual({ valor: 35.03, moeda: "usd" });
    expect(leitura.limite).toEqual({ restante: 50, valor: 50, periodo: "weekly" });
    const auth = (url: string) => new Headers(calls.find((c) => c.url.endsWith(url))!.init!.headers).get("authorization");
    expect(auth("/key")).toBe("Bearer chave");
    expect(auth("/credits")).toBe("Bearer gestao");
  });

  it("OpenRouter sem a chave de gestão, ou com ela recusada: sem saldo, e o total é o da chave", async () => {
    const { doFetch } = fakeFetch({
      "https://openrouter.ai/api/v1/key": () => Response.json({ data: { usage: 35.03, limit: null, limit_remaining: null, limit_reset: null } }),
      "https://openrouter.ai/api/v1/credits": () => Response.json({ error: { message: "Only management keys can perform this operation" } }, { status: 403 }),
    });
    for (const gestao of [undefined, "recusada"]) {
      expect(await lerOpenRouter("chave", doFetch, gestao)).toEqual({ saldo: null, limite: null, total: { valor: 35.03, moeda: "usd" } });
    }
  });

  it("HeyGen: a carteira em dólares ou em créditos, e o plano por uso", async () => {
    const carteira = fakeFetch({
      "https://api.heygen.com/v3/users/me": () => Response.json({ data: { billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 22.65 }, subscription: null, usage_based: null } }),
    });
    expect(await lerHeyGen("k", carteira.doFetch)).toEqual({ saldo: { valor: 22.65, moeda: "usd" }, limite: null, total: null });
    expect(new Headers(carteira.calls[0]!.init!.headers).get("x-api-key")).toBe("k");

    const porUso = fakeFetch({
      "https://api.heygen.com/v3/users/me": () =>
        Response.json({ data: { billing_type: "usage_based", wallet: null, subscription: null, usage_based: { spending_current_usd: 7, remaining_credits: 100 } } }),
    });
    expect(await lerHeyGen("k", porUso.doFetch)).toEqual({ saldo: { valor: 100, moeda: "creditos" }, limite: null, total: null });
  });

  it("cada provedor falha sozinho, e sem chave não chama a API", async () => {
    let chamado = false;
    const custos = await new CustosReais(
      [
        { id: "a", nome: "Sem chave", chave: undefined, ler: async () => ((chamado = true), { saldo: null, limite: null, total: null }) },
        { id: "b", nome: "Quebrado", chave: "k", ler: async () => Promise.reject(new Error("fora do ar")) },
        { id: "c", nome: "Bom", chave: "k", ler: async () => ({ saldo: { valor: 5, moeda: "usd" }, limite: null, total: null }) },
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
        { id: "openrouter", nome: "OpenRouter", estado: "ok", saldo: { valor: 24.97, moeda: "usd" }, limite: { restante: 50, valor: 50, periodo: "weekly" }, total: { valor: 35.03, moeda: "usd" } },
        { id: "heygen", nome: "HeyGen", estado: "sem_chave", saldo: null, limite: null, total: null },
      ],
      cloudflare: null,
    });
    const page = await (await get("/painel/custos?periodo=7", admin, costs)).text();
    expect(costs.pedidos).toEqual([7]);
    expect(page).toContain(">OpenRouter<");
    expect(page).toContain("US$ 24,97");
    expect(page).toContain("US$ 50,00 de US$ 50,00 por semana");
    expect(page).toContain("US$ 35,03");
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
