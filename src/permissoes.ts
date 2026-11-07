/**
 * O que cada conta pode fazer, conferido num ponto só (no molde do TabNews,
 * models/authorization.js e models/user-features.js).
 *
 * - Catálogo fechado: toda permissão está em PERMISSOES. O que vem do banco e
 *   não está aqui é ignorado.
 * - O papel (`users.role`) é um pacote de permissões, definido aqui no código:
 *   liberar algo para todos os membros é mudar o pacote, sem migration.
 * - Cada conta pode ter ajustes no banco (`users.permissoes`, JSON): a
 *   permissão a mais ("usar:modelo:teste", um testador) ou a menos, com "-"
 *   na frente ("-usar:canvas").
 * - Com um recurso de alguém (`user_id`), a conta precisa da permissão para o
 *   que é dela e da mesma com ":outros" para o que é de outra conta
 *   ("ler:video" e "ler:video:outros").
 * - "suspensa" é uma marca, como o "nuked" do TabNews: a conta não entra.
 */
import type { Role } from "./db";

export const PERMISSOES = [
  // Gerar com os modelos liberados para todos.
  "usar:modelo",
  // Os modelos em teste (estrutura com access: "admin").
  "usar:modelo:teste",
  // Abrir um vídeo; com ":outros", o de outra conta (só para ver: agir nele é só do dono).
  "ler:video",
  "ler:video:outros",
  // Projetos e o canvas de edição.
  "usar:canvas",
  // Tokens, a API e o MCP.
  "usar:api",
  // O painel do administrador: números, custos, atividade e o alarme de contêiner.
  "ver:painel",
  // Marca: a conta não entra (login, sessão e token).
  "suspensa",
] as const;

export type Permissao = (typeof PERMISSOES)[number];

const CATALOGO = new Set<string>(PERMISSOES);

/** O pacote de cada papel. */
export const PACOTES: Record<Role, readonly Permissao[]> = {
  member: ["usar:modelo", "ler:video"],
  admin: PERMISSOES.filter((p) => p !== "suspensa"),
};

/** O que pode ser conferido: o papel e os ajustes da conta. */
export interface Conta {
  id: number;
  role: Role;
  permissoes: readonly string[];
}

/** As permissões da conta: o pacote do papel, mais e menos os ajustes (só os do catálogo). */
export function permissoesDe(conta: Conta): Set<Permissao> {
  const set = new Set<Permissao>(PACOTES[conta.role] ?? []);
  for (const ajuste of conta.permissoes) {
    const tirar = ajuste.startsWith("-");
    const nome = tirar ? ajuste.slice(1) : ajuste;
    if (!CATALOGO.has(nome)) continue;
    if (tirar) set.delete(nome as Permissao);
    else set.add(nome as Permissao);
  }
  return set;
}

/**
 * A conta pode? Sem recurso, basta ter a permissão. Com um recurso de alguém, a do dono vale
 * para o que é dela, e a mesma com ":outros" para o que é de outra conta (sem dono, ninguém).
 */
export function pode(conta: Conta, permissao: Permissao, recurso?: { user_id: number | null }): boolean {
  const tem = permissoesDe(conta);
  if (!recurso) return tem.has(permissao);
  if (recurso.user_id === null) return false;
  if (recurso.user_id === conta.id) return tem.has(permissao);
  const outros = `${permissao}:outros`;
  return CATALOGO.has(outros) && tem.has(outros as Permissao);
}

/** Os ajustes guardados no banco (JSON); ilegível, nenhum. */
export function lerAjustes(texto: string | null | undefined): string[] {
  try {
    const lista = JSON.parse(texto ?? "[]");
    return Array.isArray(lista) ? lista.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
