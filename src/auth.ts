/**
 * Contas do estúdio, portadas do estuda.mais (src/auth.ts): senha com bcrypt,
 * sessões e o bloqueio depois de tentativas erradas.
 *
 * - A primeira conta cadastrada é a do administrador e, depois dela, o
 *   cadastro fecha. Convidar outras pessoas fica para depois (o estuda.mais
 *   já tem os links de convite, prontos para portar).
 * - A senha só existe como hash bcrypt (bcryptjs, em JavaScript puro: o
 *   Workers não tem bcrypt nativo). Custo 12 em produção.
 * - Sessões são códigos aleatórios de 256 bits. O navegador leva o código; o
 *   banco guarda só o hash SHA-256 dele.
 * - 5 senhas erradas seguidas bloqueiam a conta por 15 minutos.
 */
import bcrypt from "bcryptjs";
import type { Db, User } from "./db";
import { ERROS } from "./erros";

export const SESSION_DAYS = 30;
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

  // --- entrar e sair -------------------------------------------------------------

  async login(rawEmail: string, password: string): Promise<LoginResult> {
    const user = await this.db.getUserByEmail(normalizeEmail(rawEmail));
    if (!user?.passwordHash) {
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
    return this.db.sessionUser(await sha256(token), this.now().toISOString());
  }

  /** A conta de um token da API (docs/api.md). */
  async tokenUser(token: string): Promise<User | null> {
    return this.db.tokenUser(await sha256(token), this.now());
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
