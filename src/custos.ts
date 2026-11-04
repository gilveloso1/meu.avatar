/**
 * Os custos de fora do banco, para a aba Custos do painel do administrador (/painel/custos):
 *
 * - Provedores de vídeo, cada um com a sua chave: o saldo, o gasto do mês e o de hoje, no que a
 *   API de cada um informa (o que ela não informa fica vazio). Provedor novo é mais um item em
 *   PROVEDORES, com a sua função de leitura.
 *   - OpenRouter (`GET /api/v1/key`): o uso da chave hoje e no mês e o que resta do limite, se a
 *     chave tiver um. O saldo da conta (`/api/v1/credits`) pede uma chave de gestão.
 *   - HeyGen (`GET /v3/users/me`): o saldo da carteira (dólares ou créditos) ou do plano, e o gasto
 *     do período no plano por uso.
 * - Cloudflare: memória, disco e CPU de cada contêiner no período, do painel da Cloudflare (o mesmo
 *   do alarme, src/vigia.ts), e o espaço do R2, em dólares pela tabela de preço abaixo. O painel
 *   guarda 32 dias: períodos maiores viram os últimos 30 dias.
 *
 * Cada fonte falha sozinha: a tela mostra o que veio e avisa do resto. O motivo vai para o log.
 */
import type { Painel } from "./vigia";

/** Preços de 05/10/2026 (developers.cloudflare.com/containers/pricing e /r2/pricing), sem a franquia do plano. */
export const PRECO = {
  memoriaGiBSeg: 0.0000025,
  cpuSeg: 0.00002,
  discoGBSeg: 0.00000007,
  r2GBMes: 0.015,
} as const;
/** O que o plano pago da Cloudflare inclui por mês. */
export const FRANQUIA = { memoriaGiBHoras: 25, cpuMinutos: 375, r2GB: 10 } as const;
/** O painel da Cloudflare guarda o uso de contêiner por 32 dias. */
export const DIAS_CONTEINER = 30;

const GIB = 1024 ** 3;
const GB = 1e9;
const APLICACOES: Record<string, string> = {
  "meu-avatar-audiofixer": "Áudio",
  "meu-avatar-exporter": "Exportação",
  "meu-avatar-renderer": "Animações",
};

/** Um valor em dólares ou em créditos do provedor. */
export interface Valor {
  valor: number;
  moeda: "usd" | "creditos";
}

/** O que a API de um provedor informa; o que ela não informa fica null. */
export interface Leitura {
  saldo: Valor | null;
  mes: Valor | null;
  hoje: Valor | null;
}

export interface UsoProvedor extends Leitura {
  nome: string;
  /** sem_chave: o site não usa esse provedor; falhou: a API não respondeu. */
  estado: "ok" | "sem_chave" | "falhou";
}

export interface UsoServico {
  nome: string;
  /** "conteiner" mede memória e CPU no período; "r2" é o espaço agora. */
  tipo: "conteiner" | "r2";
  detalhe: string;
  custo: number;
}

export interface CustosExternos {
  provedores: UsoProvedor[];
  /** Os dias lidos e cada serviço; null sem token; "falhou" se o painel não respondeu. */
  cloudflare: { dias: number; servicos: UsoServico[]; memoriaGiBHoras: number; cpuMinutos: number; r2Bytes: number } | null | "falhou";
}

export interface CustosApi {
  custos(dias: number | null, agora?: Date): Promise<CustosExternos>;
}

/** Um provedor: o nome na tela e como ler a sua API com a chave. */
export interface Provedor {
  nome: string;
  chave: string | undefined;
  ler(chave: string, doFetch: typeof fetch): Promise<Leitura>;
}

const usd = (valor: number | null | undefined): Valor | null => (typeof valor === "number" ? { valor, moeda: "usd" } : null);

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function lerOpenRouter(chave: string, doFetch: typeof fetch): Promise<Leitura> {
  const { data } = await json<{ data: { usage_daily: number; usage_monthly: number; limit_remaining: number | null } }>(
    await doFetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${chave}` } }),
  );
  return { saldo: usd(data.limit_remaining), mes: usd(data.usage_monthly), hoje: usd(data.usage_daily) };
}

export async function lerHeyGen(chave: string, doFetch: typeof fetch): Promise<Leitura> {
  type Dados = {
    billing_type: "wallet" | "subscription" | "usage_based";
    wallet: { currency: "usd" | "credits"; remaining_balance: number | null } | null;
    subscription: { credits?: { premium_credits?: { remaining: number | null } } } | null;
    usage_based: { spending_current_usd: number | null; remaining_credits: number | null } | null;
  };
  const { data } = await json<{ data: Dados }>(await doFetch("https://api.heygen.com/v3/users/me", { headers: { "x-api-key": chave } }));
  const creditos = (valor: number | null | undefined): Valor | null => (typeof valor === "number" ? { valor, moeda: "creditos" } : null);
  if (data.billing_type === "wallet" && data.wallet) {
    const saldo = data.wallet.currency === "usd" ? usd(data.wallet.remaining_balance) : creditos(data.wallet.remaining_balance);
    return { saldo, mes: null, hoje: null };
  }
  if (data.billing_type === "usage_based" && data.usage_based) {
    return { saldo: creditos(data.usage_based.remaining_credits), mes: usd(data.usage_based.spending_current_usd), hoje: null };
  }
  return { saldo: creditos(data.subscription?.credits?.premium_credits?.remaining), mes: null, hoje: null };
}

export class CustosReais implements CustosApi {
  constructor(
    private readonly provedores: Provedor[],
    private readonly painel: Painel | null,
    private readonly bucket: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async custos(dias: number | null, agora = new Date()): Promise<CustosExternos> {
    const lidos = Math.min(dias ?? DIAS_CONTEINER, DIAS_CONTEINER);
    // O fetch solto: guardado numa propriedade, o do Worker recusa ("Illegal invocation").
    const doFetch = this.doFetch;
    const solto: typeof fetch = (entrada, opcoes) => doFetch(entrada, opcoes);
    const [provedores, cloudflare] = await Promise.all([
      Promise.all(
        this.provedores.map(async (p): Promise<UsoProvedor> => {
          const vazio = { saldo: null, mes: null, hoje: null };
          if (!p.chave) return { nome: p.nome, estado: "sem_chave", ...vazio };
          try {
            return { nome: p.nome, estado: "ok", ...(await p.ler(p.chave, solto)) };
          } catch (err) {
            console.error(`Painel: uso de ${p.nome} falhou`, String(err));
            return { nome: p.nome, estado: "falhou", ...vazio };
          }
        }),
      ),
      this.painel
        ? this.cloudflare(lidos, agora).catch((err) => {
            console.error("Painel: consumo da Cloudflare falhou", String(err));
            return "falhou" as const;
          })
        : Promise.resolve(null),
    ]);
    return { provedores, cloudflare };
  }

  private async cloudflare(dias: number, agora: Date): Promise<Exclude<CustosExternos["cloudflare"], null | "falhou">> {
    const painel = this.painel!;
    const desde = new Date(agora.getTime() - dias * 86_400_000);
    const [nomes, consumo] = await Promise.all([painel.aplicacoes(), painel.consumo(desde, agora, this.bucket)]);
    const porId = new Map([...nomes].map(([nome, id]) => [id, nome]));
    let memoriaGiBHoras = 0;
    let cpuMinutos = 0;
    const servicos: UsoServico[] = [];
    for (const a of consumo.apps) {
      // Só os contêineres deste site: a conta pode ter outros.
      const nome = APLICACOES[porId.get(a.id) ?? ""];
      if (!nome) continue;
      const gib = a.memoriaByteSeg / GIB;
      memoriaGiBHoras += gib / 3600;
      cpuMinutos += a.cpuSeg / 60;
      const custo = gib * PRECO.memoriaGiBSeg + a.cpuSeg * PRECO.cpuSeg + (a.discoByteSeg / GB) * PRECO.discoGBSeg;
      const horas = (gib / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      const cpu = (a.cpuSeg / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      servicos.push({ nome, tipo: "conteiner", detalhe: `${horas} GiB·h · ${cpu} min de CPU`, custo });
    }
    // O R2 cobra por mês: no período, a parte dos dias lidos.
    const r2 = consumo.r2 ?? { bytes: 0, objetos: 0 };
    servicos.push({
      nome: "Armazenamento",
      tipo: "r2",
      detalhe: `${r2.objetos.toLocaleString("pt-BR")} arquivos`,
      custo: (r2.bytes / GB) * PRECO.r2GBMes * (dias / 30),
    });
    servicos.sort((a, b) => b.custo - a.custo);
    return { dias, servicos, memoriaGiBHoras, cpuMinutos, r2Bytes: r2.bytes };
  }
}
