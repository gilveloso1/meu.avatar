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
  /** O avatar usado para gerar (null com arquivo solto). */
  avatar_id: string | null;
  created_at: string;
  updated_at: string;
}

export type AudioStatus = "pending" | "processing" | "done" | "failed";

/**
 * Preparo (Aleph 2): 'pending' → 'processing' → enviado ('done') ou 'failed';
 * pronto no Aleph, 'compose' → 'composing' → 'done' (ou 'failed', e fica a
 * saída pura do Aleph).
 */
export type PrepStatus = AudioStatus | "compose" | "composing" | "voz";

/** Por onde o HeyGen Avatar IV gera: o OpenRouter ou a API direta da HeyGen. */
export type Platform = "openrouter" | "heygen";

/** Voz clonada na API direta da HeyGen (tabela voices). */
export interface Voice {
  id: string;
  user_id: number;
  name: string;
  /** O id da voz na HeyGen. */
  provider_voice_id: string;
  status: "PENDING" | "ACTIVE" | "FAILED";
  error: string | null;
  /** A gravação do avatar de onde veio; vazio, foi enviada no formulário. */
  asset_id: string | null;
  created_at: string;
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

export type NewVideo = Pick<Video, "id" | "prompt" | "model" | "duration" | "resolution" | "aspect_ratio" | "image_key" | "user_id" | "request_prompt" | "style" | "language" | "extra" | "structure" | "settings"> & { avatar_id?: string | null };
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
export interface ExportRow {
  id: string;
  project_id: string;
  status: string;
  step: number;
  total: number;
  tries: number;
  claimed_at: string | null;
  plan: string;
  error: string | null;
  created_at: string;
  expires_at: string;
}

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

/** Um avatar da pessoa: guarda ativos, sem depender de nenhum modelo. */
export interface Avatar {
  id: string;
  user_id: number;
  name: string;
  description: string;
  /** A foto principal e a gravação da voz para clonagem (ids em avatar_assets). */
  photo_asset: string | null;
  voice_asset: string | null;
  created_at: string;
  updated_at: string;
  /** Na lista: quantos ativos tem e a primeira foto (a capa). */
  assets?: number;
  cover?: string | null;
  cover_face?: string | null;
}

export type AssetKind = "imagem" | "video" | "audio";

/** Um ativo do avatar (no R2, em key). */
export interface AvatarAsset {
  id: string;
  avatar_id: string;
  kind: AssetKind;
  key: string;
  name: string;
  type: string;
  size: number;
  /** O vídeo que gerou o ativo: com ele, não há arquivo próprio; vazio, o arquivo é do avatar. */
  source_video: string | null;
  /** Onde está o rosto, em imagens e vídeos: o mesmo JSON de videos.face. */
  face: string | null;
  created_at: string;
}

export class Db {
  constructor(private readonly d1: D1Database) {}

  async insertVideo(v: NewVideo, now = new Date()): Promise<Video> {
    const at = now.toISOString();
    return (await this.d1
      .prepare(
        `INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, image_key, user_id, request_prompt, style, language, extra, structure, settings, avatar_id, created_at, updated_at)
         VALUES (?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(v.id, v.prompt, v.model, v.duration, v.resolution, v.aspect_ratio, v.image_key, v.user_id, v.request_prompt, v.style, v.language, v.extra, v.structure, v.settings, v.avatar_id ?? null, at, at)
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

  /** Uma imagem ou um vídeo de avatar que ainda não teve o rosto procurado. */
  async nextAssetWithoutFace(): Promise<AvatarAsset | null> {
    return this.d1.prepare("SELECT * FROM avatar_assets WHERE kind IN ('imagem', 'video') AND face IS NULL ORDER BY created_at DESC LIMIT 1").first<AvatarAsset>();
  }

  async updateAssetFace(id: string, face: string): Promise<void> {
    await this.d1.prepare("UPDATE avatar_assets SET face = ? WHERE id = ?").bind(face, id).run();
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

  // --- Avatares e seus ativos ---

  async insertAvatar(a: { id: string; user_id: number; name: string; description?: string }, now = new Date()): Promise<Avatar> {
    const at = now.toISOString();
    return (await this.d1
      .prepare("INSERT INTO avatars (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(a.id, a.user_id, a.name, a.description ?? "", at, at)
      .first<Avatar>())!;
  }

  avatarById(id: string): Promise<Avatar | null> {
    return this.d1.prepare("SELECT * FROM avatars WHERE id = ?").bind(id).first<Avatar>();
  }

  /** Os avatares da pessoa (o mexido por último primeiro), com a contagem de ativos e a capa. */
  async avatarsByUser(userId: number, q = ""): Promise<Avatar[]> {
    return (
      await this.d1
        .prepare(
          `SELECT t.*, (SELECT x.face FROM avatar_assets x WHERE x.id = t.cover) AS cover_face FROM (
             SELECT a.*, (SELECT COUNT(*) FROM avatar_assets x WHERE x.avatar_id = a.id) AS assets,
               COALESCE(a.photo_asset, (SELECT x.id FROM avatar_assets x WHERE x.avatar_id = a.id AND x.kind = 'imagem' ORDER BY x.created_at LIMIT 1)) AS cover
             FROM avatars a WHERE a.user_id = ? AND a.name LIKE ?
           ) t ORDER BY t.updated_at DESC`,
        )
        .bind(userId, `%${q}%`)
        .all<Avatar>()
    ).results;
  }

  async updateAvatar(id: string, c: { name: string; description: string; photo_asset: string | null; voice_asset: string | null }, now = new Date()): Promise<void> {
    await this.d1
      .prepare("UPDATE avatars SET name = ?, description = ?, photo_asset = ?, voice_asset = ?, updated_at = ? WHERE id = ?")
      .bind(c.name, c.description, c.photo_asset, c.voice_asset, now.toISOString(), id)
      .run();
  }

  /** Apaga o avatar e devolve as chaves dos ativos, para sair do R2. */
  async deleteAvatar(id: string): Promise<string[]> {
    const keys = (await this.d1.prepare("SELECT key FROM avatar_assets WHERE avatar_id = ? AND source_video IS NULL").bind(id).all<{ key: string }>()).results.map((r) => r.key);
    await this.d1.batch([this.d1.prepare("DELETE FROM avatar_assets WHERE avatar_id = ?").bind(id), this.d1.prepare("DELETE FROM avatars WHERE id = ?").bind(id)]);
    return keys;
  }

  async insertAsset(a: Omit<AvatarAsset, "created_at" | "face">, now = new Date()): Promise<void> {
    const at = now.toISOString();
    await this.d1.batch([
      this.d1
        .prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, source_video, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(a.id, a.avatar_id, a.kind, a.key, a.name, a.type, a.size, a.source_video, at),
      this.d1.prepare("UPDATE avatars SET updated_at = ? WHERE id = ?").bind(at, a.avatar_id),
    ]);
  }

  async assetsByAvatar(avatarId: string): Promise<AvatarAsset[]> {
    return (await this.d1.prepare("SELECT * FROM avatar_assets WHERE avatar_id = ? ORDER BY created_at DESC").bind(avatarId).all<AvatarAsset>()).results;
  }

  /** Todos os ativos dos avatares da pessoa (para escolher num modelo). */
  async assetsByUser(userId: number): Promise<AvatarAsset[]> {
    return (await this.d1.prepare("SELECT x.* FROM avatar_assets x JOIN avatars a ON a.id = x.avatar_id WHERE a.user_id = ? ORDER BY x.created_at DESC").bind(userId).all<AvatarAsset>()).results;
  }

  asset(avatarId: string, id: string): Promise<AvatarAsset | null> {
    return this.d1.prepare("SELECT * FROM avatar_assets WHERE avatar_id = ? AND id = ?").bind(avatarId, id).first<AvatarAsset>();
  }

  /** Apaga o ativo; se era a foto principal ou a voz do avatar, o lugar fica vazio. */
  async deleteAsset(id: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("UPDATE avatars SET photo_asset = NULL WHERE photo_asset = ?").bind(id),
      this.d1.prepare("UPDATE avatars SET voice_asset = NULL WHERE voice_asset = ?").bind(id),
      this.d1.prepare("DELETE FROM avatar_assets WHERE id = ?").bind(id),
    ]);
  }

  // --- Configuração e vozes clonadas ---

  /** Por onde o HeyGen Avatar IV gera (config 'plataforma.heygen'); sem valor válido, o OpenRouter. */
  async platform(): Promise<Platform> {
    const row = await this.d1.prepare("SELECT value FROM config WHERE key = 'plataforma.heygen'").first<{ value: string }>();
    return row?.value === "heygen" ? "heygen" : "openrouter";
  }

  async setPlatform(platform: Platform): Promise<void> {
    await this.d1.prepare("INSERT INTO config (key, value) VALUES ('plataforma.heygen', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(platform).run();
  }

  /** O catálogo de vozes prontas da HeyGen guardado (config 'vozes.heygen'): ler tudo da API leva várias chamadas. */
  async voiceCatalog<T>(): Promise<{ at: number; voices: T[] } | null> {
    const row = await this.d1.prepare("SELECT value FROM config WHERE key = 'vozes.heygen'").first<{ value: string }>();
    return row ? JSON.parse(row.value) : null;
  }

  async setVoiceCatalog<T>(catalog: { at: number; voices: T[] }): Promise<void> {
    await this.d1.prepare("INSERT INTO config (key, value) VALUES ('vozes.heygen', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(catalog)).run();
  }

  async insertVoice(v: Omit<Voice, "created_at" | "error" | "asset_id"> & { asset_id?: string | null }, now = new Date()): Promise<Voice> {
    return (await this.d1
      .prepare("INSERT INTO voices (id, user_id, name, provider_voice_id, status, asset_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(v.id, v.user_id, v.name, v.provider_voice_id, v.status, v.asset_id ?? null, now.toISOString())
      .first<Voice>())!;
  }

  /** As vozes da pessoa, as mais novas primeiro (as que falharam ficam de fora). */
  async voicesByUser(userId: number): Promise<Voice[]> {
    return (await this.d1.prepare("SELECT * FROM voices WHERE user_id = ? AND status != 'FAILED' ORDER BY created_at DESC").bind(userId).all<Voice>()).results;
  }

  /** A voz que já saiu desta gravação do avatar. */
  voiceByAsset(assetId: string): Promise<Voice | null> {
    return this.d1.prepare("SELECT * FROM voices WHERE asset_id = ? AND status != 'FAILED' ORDER BY created_at DESC LIMIT 1").bind(assetId).first<Voice>();
  }

  /** Os avatares da pessoa que têm gravação de voz. */
  async avatarsWithVoice(userId: number): Promise<Avatar[]> {
    return (await this.d1.prepare("SELECT * FROM avatars WHERE user_id = ? AND voice_asset IS NOT NULL ORDER BY updated_at DESC").bind(userId).all<Avatar>()).results;
  }

  voiceById(id: string): Promise<Voice | null> {
    return this.d1.prepare("SELECT * FROM voices WHERE id = ?").bind(id).first<Voice>();
  }

  async updateVoice(id: string, status: Voice["status"], error: string | null = null): Promise<void> {
    await this.d1.prepare("UPDATE voices SET status = ?, error = ? WHERE id = ?").bind(status, error, id).run();
  }

  /** Vídeos esperando a voz clonada ficar pronta (prep_status 'voz'), os mais antigos primeiro. */
  async waitingVoice(limit = 10): Promise<Video[]> {
    return (await this.d1.prepare("SELECT * FROM videos WHERE prep_status = 'voz' ORDER BY created_at LIMIT ?").bind(limit).all<Video>()).results;
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
    await this.d1.batch([
      this.d1.prepare("DELETE FROM exports WHERE project_id = ?").bind(id),
      this.d1.prepare("DELETE FROM project_files WHERE project_id = ?").bind(id),
      this.d1.prepare("DELETE FROM projects WHERE id = ?").bind(id),
    ]);
    return keys;
  }

  async insertExport(e: Pick<ExportRow, "id" | "project_id" | "total" | "plan" | "expires_at">, now = new Date()): Promise<ExportRow> {
    return (await this.d1
      .prepare("INSERT INTO exports (id, project_id, total, plan, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(e.id, e.project_id, e.total, e.plan, now.toISOString(), e.expires_at)
      .first<ExportRow>())!;
  }

  async exportById(id: string): Promise<ExportRow | null> {
    return this.d1.prepare("SELECT * FROM exports WHERE id = ?").bind(id).first<ExportRow>();
  }

  /** A última exportação do projeto, para a tela retomar ou mostrar ao abrir. */
  async latestExport(projectId: string): Promise<ExportRow | null> {
    return this.d1.prepare("SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(projectId).first<ExportRow>();
  }

  /** Pega o próximo passo numa instrução só: dois pedidos juntos não fazem o mesmo trabalho. */
  async claimExport(id: string, staleBefore: string, now = new Date()): Promise<ExportRow | null> {
    return this.d1
      .prepare("UPDATE exports SET claimed_at = ?, tries = tries + 1 WHERE id = ? AND status = 'running' AND (claimed_at IS NULL OR claimed_at < ?) RETURNING *")
      .bind(now.toISOString(), id, staleBefore)
      .first<ExportRow>();
  }

  async finishStep(id: string, step: number, status: string, plan: string): Promise<ExportRow | null> {
    return this.d1
      .prepare("UPDATE exports SET step = ?, status = ?, plan = ?, tries = 0, claimed_at = NULL WHERE id = ? RETURNING *")
      .bind(step, status, plan, id)
      .first<ExportRow>();
  }

  async failStep(id: string, status: string, error: string | null): Promise<ExportRow | null> {
    return this.d1.prepare("UPDATE exports SET status = ?, error = ?, claimed_at = NULL WHERE id = ? RETURNING *").bind(status, error, id).first<ExportRow>();
  }

  async deleteOldExports(expiredBefore: string): Promise<void> {
    await this.d1.prepare("DELETE FROM exports WHERE expires_at < ?").bind(expiredBefore).run();
  }

  async openExports(staleBefore: string): Promise<string[]> {
    const rows = await this.d1
      .prepare("SELECT id FROM exports WHERE status = 'running' AND (claimed_at IS NULL OR claimed_at < ?) ORDER BY created_at LIMIT 5")
      .bind(staleBefore)
      .all<{ id: string }>();
    return rows.results.map((r) => r.id);
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
      this.d1.prepare("DELETE FROM exports"),
      this.d1.prepare("DELETE FROM project_files"),
      this.d1.prepare("DELETE FROM projects"),
      this.d1.prepare("DELETE FROM videos"),
      this.d1.prepare("DELETE FROM avatar_assets"),
      this.d1.prepare("DELETE FROM avatars"),
      this.d1.prepare("DELETE FROM voices"),
      this.d1.prepare("UPDATE config SET value = 'openrouter' WHERE key = 'plataforma.heygen'"),
      this.d1.prepare("DELETE FROM sessions"),
      this.d1.prepare("DELETE FROM users"),
    ]);
  }
}
