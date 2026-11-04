/**
 * As três máquinas (contêineres) do site e como cada uma está agora, para a aba Atividade do
 * painel: a própria peça que liga e desliga a máquina (o Durable Object, src/conteiner.ts) sabe
 * se ela está ligada, quantos pedidos estão em andamento e quando chegou o último. Ler isso não
 * liga a máquina, e não tem o atraso do painel da Cloudflare.
 */
import type { SleepyContainer } from "./conteiner";

/** A classe de cada máquina, o nome na tela e o ícone. A aplicação na Cloudflare é `meu-avatar-<classe>`. */
export const MAQUINAS = [
  { classe: "Exporter", nome: "Exportação", icone: "download" },
  { classe: "AudioFixer", nome: "Áudio", icone: "graphic_eq" },
  { classe: "Renderer", nome: "Animações", icone: "animation" },
] as const;

export type Classe = (typeof MAQUINAS)[number]["classe"];

/** O que o contêiner diz de si (SleepyContainer.estado). */
export interface Estado {
  ligada: boolean;
  /** Pedidos em andamento agora. */
  emAndamento: number;
  /** Quando chegou o último pedido (ms); null se a peça foi reiniciada e não lembra. */
  ultimoPedido: number | null;
}

export interface EstadoMaquina extends Estado {
  classe: Classe;
  nome: string;
  icone: string;
}

export interface MaquinasApi {
  /** Cada máquina, na ordem de MAQUINAS; null se não deu para perguntar a ela. */
  estados(): Promise<(EstadoMaquina | { classe: Classe; nome: string; icone: string; falhou: true })[]>;
}

type Namespaces = Partial<Record<Classe, { ns: DurableObjectNamespace<SleepyContainer>; nome: string }>>;

export class MaquinasReais implements MaquinasApi {
  constructor(private readonly namespaces: Namespaces) {}

  estados() {
    return Promise.all(
      MAQUINAS.map(async (m) => {
        const alvo = this.namespaces[m.classe];
        if (!alvo) return { ...m, ligada: false, emAndamento: 0, ultimoPedido: null };
        try {
          return { ...m, ...(await alvo.ns.getByName(alvo.nome).estado()) };
        } catch (err) {
          console.error(`Painel: estado da máquina ${m.nome} falhou`, String(err));
          return { ...m, falhou: true as const };
        }
      }),
    );
  }
}
