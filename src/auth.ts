/**
 * Contas do estúdio, portadas do estuda.mais (src/auth.ts): senha com bcrypt,
 * sessões e o bloqueio depois de tentativas erradas.
 *
 * - A primeira conta cadastrada é a do administrador e, depois dela, o
 *   cadastro fecha. As outras entram por convite: o administrador cria a
 *   conta e gera o link para a pessoa criar a senha (o mesmo link serve para
 *   "esqueci a senha"). Não há envio de e-mail: o link vai por onde ele quiser.
 * - A senha só existe como hash bcrypt (bcryptjs, em JavaScript puro: o
 *   Workers não tem bcrypt nativo). Custo 12 em produção.
 * - Sessões e convites são códigos aleatórios de 256 bits. O navegador (ou o
 *   link) leva o código; o banco guarda só o hash SHA-256 dele. O convite é de
 *   uso único e vale por INVITE_HOURS; criar a senha derruba as outras sessões.
 * - 5 senhas erradas seguidas bloqueiam a conta por 15 minutos.
 * - Conta com a marca "suspensa" (src/permissoes.ts) não entra: o login responde como senha
 *   errada, e a sessão e o token deixam de valer.
 */
import bcrypt from "bcryptjs";
import type { Db, User, UserLogin } from "./db";
import { ERROS } from "./erros";
import { pode } from "./permissoes";

export const SESSION_DAYS = 30;
/** Validade do link de convite (e de troca de senha). */
export const INVITE_HOURS = 72;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const PASSWORD_MIN = 10;
/** O bcrypt só usa os primeiros 72 bytes; 64 caracteres ficam dentro disso na maioria dos casos (a conferência é em bytes). */
export const PASSWORD_MAX = 64;

const NAME_MAX = 80;
const HOUR_MS = 3_600_000;

export type LoginResult =
  | { ok: true; user: User; token: string }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; until: string };

export class Accounts {
  /** Hash de uma senha qualquer: quem tenta um e-mail que não existe espera o mesmo tempo de quem erra a senha. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly db: Db,
    private readonly bcryptCost: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // --- primeiro cadastro -----------------------------------------------------------

  /** Ainda dá para se cadastrar? Só enquanto não existe nenhuma conta. */
  async signupOpen(): Promise<boolean> {
    return !(await this.db.hasUsers());
  }

  /** Cria a primeira conta, que é a do administrador, e já abre a sessão. */
  async signupFirst(rawName: string, rawEmail: string, password: string): Promise<{ user: User; token: string } | { error: string }> {
    const email = normalizeEmail(rawEmail);
    const name = cleanName(rawName);
    if (!name) return { error: ERROS.nome };
    if (!isEmail(email)) return { error: ERROS.email };
    const problem = this.passwordProblem(password);
    if (problem) return { error: problem };
    const user = await this.db.addFirstAdmin(email, name, await bcrypt.hash(password, this.bcryptCost), this.now().toISOString());
    if (!user) return { error: ERROS.cadastroFechado };
    return { user, token: await this.openSession(user.id) };
  }

  // --- convites ----------------------------------------------------------------------

  /** Cria a conta comum convidada e o link para ela criar a senha. */
  async addMember(rawEmail: string, rawName: string): Promise<{ user: User; token: string } | { error: string }> {
    const email = normalizeEmail(rawEmail);
    const name = cleanName(rawName);
    if (!name) return { error: ERROS.nome };
    if (!isEmail(email)) return { error: ERROS.email };
    const user = await this.db.addMember(email, name, this.now().toISOString());
    if (!user) return { error: ERROS.emailEmUso };
    return { user, token: await this.invite(user.id) };
  }

  /** Um link novo para a conta criar (ou trocar) a senha; o anterior deixa de valer. Devolve o código. */
  async invite(userId: number, hours = INVITE_HOURS): Promise<string> {
    const token = randomToken();
    const now = this.now();
    await this.db.addInvite(await sha256(token), userId, now.toISOString(), new Date(now.getTime() + hours * HOUR_MS).toISOString());
    return token;
  }

  /** A conta do link, se ele vale e a conta não está suspensa. */
  async inviteUser(token: string): Promise<UserLogin | null> {
    const user = await this.db.inviteUser(await sha256(token), this.now().toISOString());
    return user && !pode(user, "suspensa") ? user : null;
  }

  /** Cria a senha pelo link (que deixa de valer, com as outras sessões) e já abre a sessão. */
  async acceptInvite(token: string, password: string): Promise<{ user: User; token: string } | { error: string }> {
    const user = await this.inviteUser(token);
    if (!user) return { error: ERROS.conviteInvalido };
    const problem = this.passwordProblem(password);
    if (problem) return { error: problem };
    await this.db.setPassword(user.id, await bcrypt.hash(password, this.bcryptCost));
    return { user, token: await this.openSession(user.id) };
  }

  // --- entrar e sair -------------------------------------------------------------

  async login(rawEmail: string, password: string): Promise<LoginResult> {
    const user = await this.db.getUserByEmail(normalizeEmail(rawEmail));
    // Conta suspensa responde como senha errada, no mesmo tempo (não diz que a conta existe).
    if (!user?.passwordHash || pode(user, "suspensa")) {
      await bcrypt.compare(password, await this.dummy());
      return { ok: false, reason: "invalid" };
    }
    const now = this.now();
    if (user.lockedUntil && user.lockedUntil > now.toISOString()) return { ok: false, reason: "locked", until: user.lockedUntil };
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      if (user.failedLogins + 1 >= MAX_FAILED_LOGINS) {
        const until = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
        await this.db.addFailedLogin(user.id, until);
        return { ok: false, reason: "locked", until };
      }
      await this.db.addFailedLogin(user.id, null);
      return { ok: false, reason: "invalid" };
    }
    if (user.failedLogins || user.lockedUntil) await this.db.clearFailedLogins(user.id);
    return { ok: true, user, token: await this.openSession(user.id) };
  }

  /** A conta da sessão, ou null se o código não vale (ou venceu). */
  async session(token: string | null): Promise<User | null> {
    if (!token) return null;
    return ativa(await this.db.sessionUser(await sha256(token), this.now().toISOString()));
  }

  /** A conta de um token da API (docs/api.md). */
  async tokenUser(token: string): Promise<User | null> {
    return ativa(await this.db.tokenUser(await sha256(token), this.now()));
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.db.deleteSession(await sha256(token));
  }

  /** O que há de errado com a senha, ou null se ela serve. */
  passwordProblem(password: string): string | null {
    if (password.length < PASSWORD_MIN) return ERROS.senha(PASSWORD_MIN, PASSWORD_MAX);
    if (password.length > PASSWORD_MAX || new TextEncoder().encode(password).length > 72) {
      return ERROS.senha(PASSWORD_MIN, PASSWORD_MAX);
    }
    return null;
  }

  // --- por dentro --------------------------------------------------------------------

  private async openSession(userId: number): Promise<string> {
    const token = randomToken();
    const now = this.now();
    await this.db.addSession(await sha256(token), userId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * 24 * HOUR_MS).toISOString());
    return token;
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(randomToken(), this.bcryptCost);
    return this.dummyHash;
  }
}

/** A conta, se não está suspensa (a sessão e o token dela deixam de valer na hora). */
function ativa(user: User | null): User | null {
  return user && !pode(user, "suspensa") ? user : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

/** 256 bits aleatórios, em base64url (vai em cookie). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
