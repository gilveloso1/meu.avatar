import { ERROS } from "./erros";

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
  /** Id da estrutura que gerou o vídeo (src/structures/). */
  structure: string | null;
  /** Configurações próprias da estrutura, em JSON. */
  settings: string | null;
  /** Tratamento do áudio no contêiner (src/audio.ts); null quando não se aplica. */
  audio_status: AudioStatus | null;
  /** Chave no R2 do MP4 com o áudio tratado. */
  processed_key: string | null;
  audio_error: string | null;
  audio_started_at: string | null;
  /** Edição rápida no contêiner (container/editar.py); null enquanto ninguém pediu. */
  edit_status: AudioStatus | null;
  /** Chave no R2 do MP4 editado. */
  edited_key: string | null;
  /** Quando a edição que vale (a do edited_key) ficou pronta, e com que plano (JSON). */
  edited_at: string | null;
  edited_plan: string | null;
  edit_error: string | null;
  edit_started_at: string | null;
  /** O plano da edição (src/quickedit.ts), em JSON. */
  edit_plan: string | null;
  /** Onde está o rosto (container/rosto.py), em JSON; null enquanto ninguém pediu. */
  face: string | null;
  /** Preparo antes do envio e composição depois (troca de avatar pelo Aleph 2); null nos outros modelos. */
  prep_status: PrepStatus | null;
  prep_error: string | null;
  prep_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AudioStatus = "pending" | "processing" | "done" | "failed";

/**
 * Preparo (Aleph 2): 'pending' → 'processing' → enviado ('done') ou 'failed';
 * pronto no Aleph, 'compose' → 'composing' → 'done' (ou 'failed', e fica a
 * saída pura do Aleph).
 */
export type PrepStatus = AudioStatus | "compose" | "composing";

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

export type NewVideo = Pick<Video, "id" | "prompt" | "model" | "duration" | "resolution" | "aspect_ratio" | "image_key" | "user_id" | "request_prompt" | "style" | "language" | "extra" | "structure" | "settings">;
export type VideoChanges = Partial<
  Pick<
    Video,
    | "job_id"
    | "status"
    | "duration"
    | "resolution"
    | "aspect_ratio"
    | "settings"
    | "prep_status"
    | "prep_error"
    | "video_key"
    | "cost"
    | "error"
    | "audio_status" | "processed_key" | "audio_error" | "audio_started_at" | "edit_status" | "edited_key" | "edited_at" | "edited_plan" | "edit_error" | "face"
  >
>;

/** Projeto do canvas de edição: o canvas inteiro em JSON (src/canvas/modelo.js). */
export interface Project {
  id: string;
  user_id: number;
  name: string;
  data: string;
  created_at: string;
  updated_at: string;
}

/** Arquivo enviado do computador para um projeto (no R2, em key). */
export interface ProjectFile {
  id: string;
  project_id: string;
  key: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
}

/** Status em que o vídeo ainda pode mudar (vale consultar o OpenRouter). */
export const OPEN_STATUSES: VideoStatus[] = ["pending", "in_progress"];

export class Db {
  constructor(private readonly d1: D1Database) {}

  async insertVideo(v: NewVideo, now = new Date()): Promise<Video> {
    const at = now.toISOString();
    return (await this.d1
      .prepare(
        `INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, image_key, user_id, request_prompt, style, language, extra, structure, settings, created_at, updated_at)
         VALUES (?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(v.id, v.prompt, v.model, v.duration, v.resolution, v.aspect_ratio, v.image_key, v.user_id, v.request_prompt, v.style, v.language, v.extra, v.structure, v.settings, at, at)
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

  /** Os vídeos de uma estrutura, os mais novos primeiro. */
  async videosByStructure(structure: string, limit = 50): Promise<Video[]> {
    return (
      await this.d1.prepare("SELECT * FROM videos WHERE structure = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(structure, limit).all<Video>()
    ).results;
  }

  /** Os vídeos de várias estruturas, os mais novos primeiro; com `q`, só os que têm o trecho na fala. */
  async videosByStructures(structures: string[], q = "", limit = 100): Promise<Video[]> {
    if (!structures.length) return [];
    const marks = structures.map(() => "?").join(", ");
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return (
      await this.d1
        .prepare(`SELECT * FROM videos WHERE structure IN (${marks}) AND prompt LIKE ? ESCAPE '\\' ORDER BY created_at DESC, rowid DESC LIMIT ?`)
        .bind(...structures, like, limit)
        .all<Video>()
    ).results;
  }

  /** Quantos vídeos cada estrutura tem. */
  /** Um vídeo pronto (e com o áudio já tratado, se for o caso) que ainda não teve o rosto procurado. */
  async nextWithoutFace(): Promise<Video | null> {
    return this.d1
      .prepare(
        `SELECT * FROM videos WHERE status = 'completed' AND video_key IS NOT NULL AND face IS NULL
           AND (audio_status IS NULL OR audio_status IN ('done', 'failed'))
         ORDER BY created_at DESC LIMIT 1`,
      )
      .first<Video>();
  }

  async countByStructure(): Promise<Map<string, number>> {
    const rows = (await this.d1.prepare("SELECT structure, COUNT(*) AS n FROM videos GROUP BY structure").all<{ structure: string | null; n: number }>()).results;
    return new Map(rows.map((r) => [r.structure ?? "", r.n]));
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

  /**
   * Pega o próximo vídeo com o áudio na fila e já o marca como em tratamento,
   * numa instrução só: duas rodadas do agendamento não pegam o mesmo vídeo.
   */
  claimAudio(nowIso: string): Promise<Video | null> {
    return this.d1
      .prepare(
        `UPDATE videos SET audio_status = 'processing', audio_started_at = ?, updated_at = ?
         WHERE id = (SELECT id FROM videos WHERE audio_status = 'pending' ORDER BY created_at LIMIT 1)
         RETURNING *`,
      )
      .bind(nowIso, nowIso)
      .first<Video>();
  }

  /** Tratamentos que começaram antes de `beforeIso` e não terminaram: viram falha. */
  async failStaleAudio(beforeIso: string, nowIso: string): Promise<number> {
    const result = await this.d1
      .prepare(
        `UPDATE videos SET audio_status = 'failed', audio_error = ?, updated_at = ?
         WHERE audio_status = 'processing' AND audio_started_at < ?`,
      )
      .bind(ERROS.audioDemorou, nowIso, beforeIso)
      .run();
    return result.meta.changes;
  }

  /** Põe o vídeo na fila da edição rápida, com o plano, se ele não está nela. */
  queueEdit(id: string, plan: string, nowIso: string): Promise<Video | null> {
    return this.d1
      .prepare(
        `UPDATE videos SET edit_status = 'pending', edit_plan = ?, edit_error = NULL, updated_at = ?
         WHERE id = ? AND (edit_status IS NULL OR edit_status NOT IN ('pending', 'processing')) RETURNING *`,
      )
      .bind(plan, nowIso, id)
      .first<Video>();
  }

  /** Como claimAudio, para a edição rápida. */
  claimEdit(nowIso: string): Promise<Video | null> {
    return this.d1
      .prepare(
        `UPDATE videos SET edit_status = 'processing', edit_started_at = ?, updated_at = ?
         WHERE id = (SELECT id FROM videos WHERE edit_status = 'pending' ORDER BY updated_at LIMIT 1)
         RETURNING *`,
      )
      .bind(nowIso, nowIso)
      .first<Video>();
  }

  /** Como claimAudio, para o preparo antes do envio (troca de avatar pelo Aleph 2). */
  claimPrep(nowIso: string): Promise<Video | null> {
    return this.d1
      .prepare(
        `UPDATE videos SET prep_status = 'processing', prep_started_at = ?, updated_at = ?
         WHERE id = (SELECT id FROM videos WHERE prep_status = 'pending' ORDER BY created_at LIMIT 1)
         RETURNING *`,
      )
      .bind(nowIso, nowIso)
      .first<Video>();
  }

  /** Como claimPrep, para a composição depois do Aleph ('compose' → 'composing'). */
  claimCompose(nowIso: string): Promise<Video | null> {
    return this.d1
      .prepare(
        `UPDATE videos SET prep_status = 'composing', prep_started_at = ?, updated_at = ?
         WHERE id = (SELECT id FROM videos WHERE prep_status = 'compose' ORDER BY updated_at LIMIT 1)
         RETURNING *`,
      )
      .bind(nowIso, nowIso)
      .first<Video>();
  }

  /** Composições que começaram antes de `beforeIso` e não terminaram. */
  async staleCompositions(beforeIso: string): Promise<Video[]> {
    return (await this.d1.prepare("SELECT * FROM videos WHERE prep_status = 'composing' AND prep_started_at < ?").bind(beforeIso).all<Video>()).results;
  }

  /** Preparos que começaram antes de `beforeIso` e não terminaram: o vídeo vira falha. */
  async failStalePrep(beforeIso: string, nowIso: string): Promise<number> {
    const result = await this.d1
      .prepare(
        `UPDATE videos SET prep_status = 'failed', prep_error = 'O preparo demorou demais.', status = 'failed', updated_at = ?
         WHERE prep_status = 'processing' AND prep_started_at < ?`,
      )
      .bind(nowIso, beforeIso)
      .run();
    return result.meta.changes;
  }

  /** Edições que começaram antes de `beforeIso` e não terminaram: viram falha. */
  async failStaleEdit(beforeIso: string, nowIso: string): Promise<number> {
    const result = await this.d1
      .prepare(
        `UPDATE videos SET edit_status = 'failed', edit_error = ?, updated_at = ?
         WHERE edit_status = 'processing' AND edit_started_at < ?`,
      )
      .bind(ERROS.edicaoDemorou, nowIso, beforeIso)
      .run();
    return result.meta.changes;
  }

  // --- contas e sessões (como no estuda.mais) ---------------------------------------

  // --- Projetos do canvas ---

  async insertProject(p: { id: string; user_id: number; name: string; data: string }, now = new Date()): Promise<Project> {
    const at = now.toISOString();
    return (await this.d1
      .prepare("INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(p.id, p.user_id, p.name, p.data, at, at)
      .first<Project>())!;
  }

  async projectById(id: string): Promise<Project | null> {
    return this.d1.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Project>();
  }

  /** Os projetos da pessoa, o editado por último primeiro; q filtra pelo nome. */
  async projectsByUser(userId: number, q = "", limit = 200): Promise<Project[]> {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return (
      await this.d1
        .prepare("SELECT * FROM projects WHERE user_id = ? AND name LIKE ? ESCAPE '\\' ORDER BY updated_at DESC, rowid DESC LIMIT ?")
        .bind(userId, like, limit)
        .all<Project>()
    ).results;
  }

  async saveProject(id: string, changes: { name?: string; data?: string }, now = new Date()): Promise<void> {
    await this.d1
      .prepare("UPDATE projects SET name = COALESCE(?, name), data = COALESCE(?, data), updated_at = ? WHERE id = ?")
      .bind(changes.name ?? null, changes.data ?? null, now.toISOString(), id)
      .run();
  }

  /** Apaga o projeto e devolve as chaves no R2 dos arquivos dele (para apagar lá também). */
  async deleteProject(id: string): Promise<string[]> {
    const keys = (await this.d1.prepare("SELECT key FROM project_files WHERE project_id = ?").bind(id).all<{ key: string }>()).results.map((r) => r.key);
    await this.d1.batch([this.d1.prepare("DELETE FROM project_files WHERE project_id = ?").bind(id), this.d1.prepare("DELETE FROM projects WHERE id = ?").bind(id)]);
    return keys;
  }

  async insertProjectFile(f: Omit<ProjectFile, "created_at">, now = new Date()): Promise<void> {
    await this.d1
      .prepare("INSERT INTO project_files (id, project_id, key, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(f.id, f.project_id, f.key, f.name, f.type, f.size, now.toISOString())
      .run();
  }

  async projectFile(projectId: string, id: string): Promise<ProjectFile | null> {
    return this.d1.prepare("SELECT * FROM project_files WHERE project_id = ? AND id = ?").bind(projectId, id).first<ProjectFile>();
  }

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
      this.d1.prepare("DELETE FROM project_files"),
      this.d1.prepare("DELETE FROM projects"),
      this.d1.prepare("DELETE FROM videos"),
      this.d1.prepare("DELETE FROM sessions"),
      this.d1.prepare("DELETE FROM users"),
    ]);
  }
}
