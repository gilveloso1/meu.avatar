export type VideoStatus = "submitting" | "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";

export interface Video {
  id: string;
  job_id: string | null;
  status: VideoStatus;
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  image_key: string | null;
  video_key: string | null;
  cost: number | null;
  error: string | null;
  /** Quem pediu (null nos pedidos de antes das contas). */
  user_id: number | null;
  /** O prompt como foi para o modelo, com a orientação fixa (null nos pedidos antigos). */
  request_prompt: string | null;
  /** Estilo, idioma e instruções extras do formulário (null nos pedidos antigos). */
  style: string | null;
  language: string | null;
  extra: string | null;
  created_at: string;
  updated_at: string;
}

export type Role = "admin" | "member";

/** Quem entra no estúdio. */
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

/** A conta com o que só o login usa. */
export interface UserLogin extends User {
  passwordHash: string | null;
  failedLogins: number;
  lockedUntil: string | null;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  password_hash: string | null;
  created_at: string;
  failed_logins: number;
  locked_until: string | null;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
}

function toUserLogin(row: UserRow): UserLogin {
  return { ...toUser(row), passwordHash: row.password_hash, failedLogins: row.failed_logins, lockedUntil: row.locked_until };
}

export type NewVideo = Pick<Video, "id" | "prompt" | "model" | "duration" | "resolution" | "aspect_ratio" | "image_key" | "user_id" | "request_prompt" | "style" | "language" | "extra">;
export type VideoChanges = Partial<Pick<Video, "job_id" | "status" | "video_key" | "cost" | "error">>;

/** Status em que o vídeo ainda pode mudar (vale consultar o OpenRouter). */
export const OPEN_STATUSES: VideoStatus[] = ["pending", "in_progress"];

export class Db {
  constructor(private readonly d1: D1Database) {}

  async insertVideo(v: NewVideo, now = new Date()): Promise<Video> {
    const at = now.toISOString();
    return (await this.d1
      .prepare(
        `INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, image_key, user_id, request_prompt, style, language, extra, created_at, updated_at)
         VALUES (?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(v.id, v.prompt, v.model, v.duration, v.resolution, v.aspect_ratio, v.image_key, v.user_id, v.request_prompt, v.style, v.language, v.extra, at, at)
      .first<Video>())!;
  }

  async updateVideo(id: string, changes: VideoChanges, now = new Date()): Promise<Video | null> {
    const fields = Object.entries(changes).filter(([, value]) => value !== undefined);
    const sets = [...fields.map(([key]) => `${key} = ?`), "updated_at = ?"].join(", ");
    return this.d1
      .prepare(`UPDATE videos SET ${sets} WHERE id = ? RETURNING *`)
      .bind(...fields.map(([, value]) => value), now.toISOString(), id)
      .first<Video>();
  }

  videoById(id: string): Promise<Video | null> {
    return this.d1.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<Video>();
  }

  videoByJob(jobId: string): Promise<Video | null> {
    return this.d1.prepare("SELECT * FROM videos WHERE job_id = ?").bind(jobId).first<Video>();
  }

  async recentVideos(limit = 50): Promise<Video[]> {
    return (await this.d1.prepare("SELECT * FROM videos ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(limit).all<Video>()).results;
  }

  /** Os mais antigos primeiro: são os que mais devem estar prontos. */
  async openVideos(limit = 10): Promise<Video[]> {
    const marks = OPEN_STATUSES.map(() => "?").join(", ");
    return (
      await this.d1
        .prepare(`SELECT * FROM videos WHERE status IN (${marks}) ORDER BY created_at LIMIT ?`)
        .bind(...OPEN_STATUSES, limit)
        .all<Video>()
    ).results;
  }

  // --- contas e sessões (como no estuda.mais) ---------------------------------------

  async hasUsers(): Promise<boolean> {
    return (await this.d1.prepare("SELECT 1 FROM users LIMIT 1").first()) !== null;
  }

  /**
   * Cria a conta do administrador só se ainda não há nenhuma conta, numa
   * instrução só: dois cadastros ao mesmo tempo não viram dois administradores.
   * null se o cadastro já fechou.
   */
  async addFirstAdmin(email: string, name: string, passwordHash: string, nowIso: string): Promise<User | null> {
    const row = await this.d1
      .prepare(
        `INSERT INTO users (email, name, role, password_hash, created_at)
         SELECT ?, ?, 'admin', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)
         ON CONFLICT DO NOTHING RETURNING *`,
      )
      .bind(email, name, passwordHash, nowIso)
      .first<UserRow>();
    return row ? toUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<UserLogin | null> {
    const row = await this.d1.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
    return row ? toUserLogin(row) : null;
  }

  /** Conta uma tentativa errada; com `lockedUntil`, bloqueia a conta até lá e zera a contagem. */
  async addFailedLogin(userId: number, lockedUntil: string | null): Promise<void> {
    const statement = lockedUntil
      ? this.d1.prepare("UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?").bind(lockedUntil, userId)
      : this.d1.prepare("UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ?").bind(userId);
    await statement.run();
  }

  async clearFailedLogins(userId: number): Promise<void> {
    await this.d1.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(userId).run();
  }

  async addSession(tokenHash: string, userId: number, nowIso: string, expiresIso: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(nowIso),
      this.d1
        .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(tokenHash, userId, nowIso, expiresIso),
    ]);
  }

  /** A conta da sessão, se ela existe e não venceu. */
  async sessionUser(tokenHash: string, nowIso: string): Promise<User | null> {
    const row = await this.d1
      .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
      .bind(tokenHash, nowIso)
      .first<UserRow>();
    return row ? toUser(row) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.d1.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  /** Só nos testes. */
  async resetAll(): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("DELETE FROM videos"),
      this.d1.prepare("DELETE FROM sessions"),
      this.d1.prepare("DELETE FROM users"),
    ]);
  }
}
