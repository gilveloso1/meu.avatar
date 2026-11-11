import { ERROS } from "./erros";
import { lerAjustes } from "./permissoes";

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
  /** Última conferência do agendamento no provedor (openVideos). */
  checked_at: string | null;
  /** A pasta da aba Vídeos em que o vídeo está (account_folders); vazio, fora de pasta. */
  folder_id: string | null;
  /** O avatar usado para gerar (null com arquivo solto). */
  avatar_id: string | null;
  /** O nome dado pela pessoa (Renomear); null: as telas mostram a fala. */
  name: string | null;
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
export type VoiceProvider = "heygen" | "fish";

export interface Voice {
  id: string;
  user_id: number;
  name: string;
  /** De onde é a voz clonada: a HeyGen ou o Fish (migrations/0022_vozes_fish.sql). */
  provider: VoiceProvider;
  /** O id da voz na HeyGen; no Fish, a gravação no R2 (a clonagem vai em cada pedido). */
  provider_voice_id: string;
  status: "PENDING" | "ACTIVE" | "FAILED";
  error: string | null;
  /** A gravação do avatar de onde veio; vazio, foi enviada no formulário. */
  asset_id: string | null;
  created_at: string;
}

export type Role = "admin" | "member";

/** Quem entra no estúdio. O que pode fazer: src/permissoes.ts (pode). */
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** Ajustes ao pacote do papel (users.permissoes): a mais, ou a menos com "-". */
  permissoes: string[];
  createdAt: string;
}

/** Uma conta na aba Contas do painel. */
export interface AccountRow extends User {
  /** Já criou a senha (aceitou o convite). */
  hasPassword: boolean;
  /** Até quando vale o último link de convite (null: nenhum). */
  inviteUntil: string | null;
  videos: number;
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
  permissoes: string | null;
  password_hash: string | null;
  created_at: string;
  failed_logins: number;
  locked_until: string | null;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, role: row.role, permissoes: lerAjustes(row.permissoes), createdAt: row.created_at };
}

function toUserLogin(row: UserRow): UserLogin {
  return { ...toUser(row), passwordHash: row.password_hash, failedLogins: row.failed_logins, lockedUntil: row.locked_until };
}

/** Vídeo novo: sempre com dono (o banco recusa sem, migrations/0018_dono.sql). */
export type NewVideo = Pick<Video, "id" | "prompt" | "model" | "duration" | "resolution" | "aspect_ratio" | "image_key" | "request_prompt" | "style" | "language" | "extra" | "structure" | "settings"> & { user_id: number; avatar_id?: string | null };
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
  /** Sobe a cada mudança: quem salva diz de qual revisão partiu. */
  revision: number;
  /** A pasta da lista de Projetos em que o projeto está (account_folders); vazio, fora de pasta. */
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

/** De que lista é uma pasta da conta: a aba Vídeos ou Projetos. */
export type FolderKind = "videos" | "projetos";

/** Pasta da conta (simples, sem pasta dentro de pasta), na aba Vídeos ou em Projetos. */
export interface AccountFolder {
  id: string;
  user_id: number;
  kind: FolderKind;
  name: string;
  created_at: string;
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
  /** A pasta do avatar em que o ativo está; vazio, fora de pasta (a lista Ativos). */
  folder_id: string | null;
  created_at: string;
}

/** Pasta dos ativos de um avatar: simples, sem pasta dentro de pasta. */
export interface Folder {
  id: string;
  avatar_id: string;
  name: string;
  created_at: string;
}

/** Os números do painel do administrador (/painel), de todas as contas, desde `since` (ou de sempre). */
export interface PanelStats {
  /** Por modelo: vídeos pedidos e o gasto dos que o provedor cobrou. */
  models: { structure: string; videos: number; cost: number }[];
  /** Por provedor (`settings.platform`; sem ele, o OpenRouter): o gasto dos vídeos do período. */
  platforms: { platform: string; videos: number; cost: number }[];
  videos: { total: number; done: number; failed: number; busy: number; seconds: number; audioFailed: number; editFailed: number };
  projects: { created: number; exports: number; exportsFailed: number };
  accounts: { users: number; avatars: number; assets: number };
}

/** Uma falha recente, para a aba Atividade do painel: o que falhou, de quem, o motivo técnico e quando. */
export interface PanelFailure {
  kind: "video" | "audio" | "edit" | "export";
  /** O vídeo (video, audio, edit) ou o projeto (export). */
  ref: string;
  user_id: number | null;
  owner: string | null;
  /** A fala do vídeo ou o nome do projeto. */
  title: string;
  reason: string | null;
  at: string;
}

/** Um token de API (MCP e agentes), com o dono e o último uso (gravado no máximo uma vez por hora). */
export interface PanelToken {
  name: string;
  owner: string;
  created_at: string;
  last_used_at: string | null;
}

export class Db {
  constructor(private readonly d1: D1Database) {}

  /** O banco visto por uma conta: só o que é dela (ContaDb). As telas, a API e o MCP usam este. */
  conta(userId: number): ContaDb {
    return new ContaDb(this.d1, userId);
  }

  /** As falhas do período, das mais novas, uma página: vídeos, áudio, edição rápida e exportações, juntas por data; e o total. */
  async panelFailures(since: string | null, limit = 15, offset = 0): Promise<{ items: PanelFailure[]; total: number }> {
    const from = since ?? "";
    const all = `SELECT 'video' AS kind, id AS ref, user_id, prompt AS title, error AS reason, updated_at AS at FROM videos
               WHERE status IN ('failed', 'cancelled', 'expired') AND updated_at >= ?1
             UNION ALL
             SELECT 'audio', id, user_id, prompt, audio_error, updated_at FROM videos WHERE audio_status = 'failed' AND updated_at >= ?1
             UNION ALL
             SELECT 'edit', id, user_id, prompt, edit_error, updated_at FROM videos WHERE edit_status = 'failed' AND updated_at >= ?1
             UNION ALL
             SELECT 'export', p.id, p.user_id, p.name, e.error, e.created_at FROM exports e JOIN projects p ON p.id = e.project_id
               WHERE e.status = 'failed' AND e.created_at >= ?1`;
    const [items, total] = await this.d1.batch([
      this.d1.prepare(`SELECT f.*, u.name AS owner FROM (${all}) f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.at DESC LIMIT ?2 OFFSET ?3`).bind(from, limit, offset),
      this.d1.prepare(`SELECT COUNT(*) AS n FROM (${all})`).bind(from),
    ]);
    return { items: items!.results as PanelFailure[], total: (total!.results[0] as { n: number }).n };
  }

  /** Os tokens de API de todas as contas, os usados por último primeiro. */
  async panelTokens(): Promise<PanelToken[]> {
    return (
      await this.d1
        .prepare(
          `SELECT t.name, u.name AS owner, t.created_at, t.last_used_at FROM api_tokens t JOIN users u ON u.id = t.user_id
           ORDER BY t.last_used_at IS NULL, t.last_used_at DESC, t.created_at DESC`,
        )
        .all<PanelToken>()
    ).results;
  }

  async panelStats(since: string | null): Promise<PanelStats> {
    // Sem período, a data mínima pega tudo (as datas são ISO, em texto).
    const from = since ?? "";
    const [models, platforms, videos, projects, accounts] = await this.d1.batch([
      this.d1
        .prepare("SELECT COALESCE(structure, '') AS structure, COUNT(*) AS videos, COALESCE(SUM(cost), 0) AS cost FROM videos WHERE created_at >= ? GROUP BY structure ORDER BY cost DESC, videos DESC")
        .bind(from),
      this.d1
        .prepare(
          `SELECT CASE WHEN json_valid(settings) AND json_extract(settings, '$.platform') = 'heygen' THEN 'heygen' ELSE 'openrouter' END AS platform,
             COUNT(*) AS videos, COALESCE(SUM(cost), 0) AS cost
           FROM videos WHERE created_at >= ? GROUP BY platform`,
        )
        .bind(from),
      this.d1
        .prepare(
          `SELECT COUNT(*) AS total,
             COALESCE(SUM(status = 'completed'), 0) AS done,
             COALESCE(SUM(status IN ('failed', 'cancelled', 'expired')), 0) AS failed,
             COALESCE(SUM(status IN ('submitting', 'pending', 'in_progress')), 0) AS busy,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN duration END), 0) AS seconds,
             COALESCE(SUM(audio_status = 'failed'), 0) AS audioFailed,
             COALESCE(SUM(edit_status = 'failed'), 0) AS editFailed
           FROM videos WHERE created_at >= ?`,
        )
        .bind(from),
      this.d1
        .prepare(
          `SELECT (SELECT COUNT(*) FROM projects WHERE created_at >= ?1) AS created,
             (SELECT COUNT(*) FROM exports WHERE created_at >= ?1) AS exports,
             (SELECT COUNT(*) FROM exports WHERE created_at >= ?1 AND status = 'failed') AS exportsFailed`,
        )
        .bind(from),
      this.d1
        .prepare(
          `SELECT (SELECT COUNT(*) FROM users WHERE created_at >= ?1) AS users,
             (SELECT COUNT(*) FROM avatars WHERE created_at >= ?1) AS avatars,
             (SELECT COUNT(*) FROM avatar_assets WHERE created_at >= ?1) AS assets`,
        )
        .bind(from),
    ]);
    return {
      models: models!.results as PanelStats["models"],
      platforms: platforms!.results as PanelStats["platforms"],
      videos: videos!.results[0] as PanelStats["videos"],
      projects: projects!.results[0] as PanelStats["projects"],
      accounts: accounts!.results[0] as PanelStats["accounts"],
    };
  }

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

  /**
   * Grava o que o provedor respondeu, só se o vídeo ainda espera por ele (aberto e fora da
   * composição). O aviso do provedor e o agendamento podem conferir o mesmo vídeo ao mesmo tempo:
   * só o primeiro grava; o segundo recebe null e não reabre o vídeo nem repõe o áudio na fila.
   */
  async updateOpenVideo(id: string, changes: VideoChanges, now = new Date()): Promise<Video | null> {
    const fields = Object.entries(changes).filter(([, value]) => value !== undefined);
    const sets = [...fields.map(([key]) => `${key} = ?`), "updated_at = ?"].join(", ");
    const marks = OPEN_STATUSES.map(() => "?").join(", ");
    return this.d1
      .prepare(`UPDATE videos SET ${sets} WHERE id = ? AND status IN (${marks}) AND (prep_status IS NULL OR prep_status NOT IN ('compose', 'composing')) RETURNING *`)
      .bind(...fields.map(([, value]) => value), now.toISOString(), id, ...OPEN_STATUSES)
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

  /** Muda o nome de um ativo (a página do ativo; quem chama já conferiu o dono do avatar). */
  async renameAsset(id: string, name: string): Promise<void> {
    await this.d1.prepare("UPDATE avatar_assets SET name = ? WHERE id = ?").bind(name, id).run();
  }

  /**
   * O rosto achado no navegador (miniaturas e prévia da Edição rápida): só grava se ainda não foi
   * procurado, e sem mexer no updated_at (não é uma mudança do vídeo).
   */
  async setFaceIfEmpty(table: "videos" | "avatar_assets", id: string, face: string): Promise<boolean> {
    const r = await this.d1.prepare(`UPDATE ${table} SET face = ? WHERE id = ? AND face IS NULL`).bind(face, id).run();
    return r.meta.changes > 0;
  }

  async updateAssetFace(id: string, face: string): Promise<void> {
    await this.d1.prepare("UPDATE avatar_assets SET face = ? WHERE id = ?").bind(face, id).run();
  }

  /**
   * Os vídeos abertos que o provedor ainda pode fechar (com job, fora da composição: os outros
   * abertos andam por outras filas), do conferido há mais tempo ao mais recente; o nunca conferido
   * conta pela criação. Já marca a conferência, na mesma instrução: presos no começo da fila não
   * seguram os mais novos, que entram na rodada seguinte.
   */
  async openVideos(limit = 10, nowIso = new Date().toISOString()): Promise<Video[]> {
    const marks = OPEN_STATUSES.map(() => "?").join(", ");
    const { results } = await this.d1
      .prepare(
        `UPDATE videos SET checked_at = ? WHERE id IN (
           SELECT id FROM videos
           WHERE status IN (${marks}) AND job_id IS NOT NULL AND (prep_status IS NULL OR prep_status NOT IN ('compose', 'composing'))
           ORDER BY COALESCE(checked_at, created_at), created_at LIMIT ?
         ) RETURNING *`,
      )
      .bind(nowIso, ...OPEN_STATUSES, limit)
      .all<Video>();
    return results.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Vídeo aberto desde antes de `beforeIso` (o provedor esqueceu o job, ou o preparo nunca andou):
   * vira falha e sai de todas as filas. Devolve os que falharam.
   */
  async failStaleOpen(beforeIso: string, nowIso: string): Promise<Video[]> {
    const marks = OPEN_STATUSES.map(() => "?").join(", ");
    return (
      await this.d1
        .prepare(
          `UPDATE videos SET status = 'failed', error = ?, updated_at = ?,
             prep_status = CASE WHEN prep_status IN ('pending', 'processing', 'voz', 'compose', 'composing') THEN 'failed' ELSE prep_status END
           WHERE status IN (${marks}) AND created_at < ? RETURNING *`,
        )
        .bind(ERROS.videoDemorou, nowIso, ...OPEN_STATUSES, beforeIso)
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
  /**
   * Imagem que não terminou: a geração roda no próprio pedido e, se ele caiu no meio, a linha
   * ficaria "Gerando" para sempre. Não se tenta de novo (a primeira pode ter sido cobrada).
   */
  async failStaleImages(structures: string[], beforeIso: string, nowIso: string): Promise<number> {
    if (!structures.length) return 0;
    const result = await this.d1
      .prepare(
        `UPDATE videos SET status = 'failed', error = 'A imagem ou a fala não voltou a tempo.', updated_at = ?
         WHERE structure IN (${structures.map(() => "?").join(", ")}) AND status = 'in_progress' AND created_at < ?`,
      )
      .bind(nowIso, ...structures, beforeIso)
      .run();
    return result.meta.changes;
  }

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
             FROM avatars a WHERE a.user_id = ? AND a.name LIKE ? ESCAPE '\\'
           ) t ORDER BY t.updated_at DESC`,
        )
        .bind(userId, like(q))
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
    await this.d1.batch([
      this.d1.prepare("DELETE FROM avatar_assets WHERE avatar_id = ?").bind(id),
      this.d1.prepare("DELETE FROM folders WHERE avatar_id = ?").bind(id),
      this.d1.prepare("DELETE FROM avatars WHERE id = ?").bind(id),
    ]);
    return keys;
  }

  async insertAsset(a: Omit<AvatarAsset, "created_at" | "face" | "folder_id"> & { folder_id?: string | null }, now = new Date()): Promise<void> {
    const at = now.toISOString();
    await this.d1.batch([
      this.d1
        .prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, source_video, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(a.id, a.avatar_id, a.kind, a.key, a.name, a.type, a.size, a.source_video, a.folder_id ?? null, at),
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

  /** Um ativo de qualquer avatar da pessoa, pelo id (a API dos projetos não pede o avatar). */
  assetOfUser(userId: number, id: string): Promise<AvatarAsset | null> {
    return this.d1.prepare("SELECT x.* FROM avatar_assets x JOIN avatars a ON a.id = x.avatar_id WHERE a.user_id = ? AND x.id = ?").bind(userId, id).first<AvatarAsset>();
  }

  /** O arquivo do ativo no R2: o enviado ou, se gerado, a versão que vale do vídeo. */
  async assetKey(asset: AvatarAsset): Promise<string> {
    const video = asset.source_video ? await this.videoById(asset.source_video) : null;
    return (video && (video.edited_key ?? video.processed_key ?? video.video_key)) || asset.key;
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

  // --- Pastas dos ativos de um avatar (quem chama já conferiu o dono do avatar) ---

  /** As pastas do avatar, pelo nome. */
  async folders(avatarId: string): Promise<Folder[]> {
    return (await this.d1.prepare("SELECT * FROM folders WHERE avatar_id = ? ORDER BY name COLLATE NOCASE, created_at").bind(avatarId).all<Folder>()).results;
  }

  async insertFolder(f: Omit<Folder, "created_at">, now = new Date()): Promise<void> {
    await this.d1.prepare("INSERT INTO folders (id, avatar_id, name, created_at) VALUES (?, ?, ?, ?)").bind(f.id, f.avatar_id, f.name, now.toISOString()).run();
  }

  async renameFolder(avatarId: string, id: string, name: string): Promise<void> {
    await this.d1.prepare("UPDATE folders SET name = ? WHERE id = ? AND avatar_id = ?").bind(name, id, avatarId).run();
  }

  /**
   * Apaga a pasta. Com `withItems`, os ativos dela são apagados junto (a foto principal e a voz do
   * avatar esvaziam, como ao apagar um ativo) e voltam as chaves dos arquivos do avatar a tirar do
   * R2; sem, os ativos voltam para a lista, fora de pasta, e nenhum arquivo é apagado.
   */
  async deleteFolder(folder: Folder, withItems: boolean): Promise<string[]> {
    const inside = "SELECT id FROM avatar_assets WHERE folder_id = ?1 AND avatar_id = ?2";
    const drop = this.d1.prepare("DELETE FROM folders WHERE id = ?1 AND avatar_id = ?2").bind(folder.id, folder.avatar_id);
    if (!withItems) {
      await this.d1.batch([this.d1.prepare("UPDATE avatar_assets SET folder_id = NULL WHERE folder_id = ?1 AND avatar_id = ?2").bind(folder.id, folder.avatar_id), drop]);
      return [];
    }
    const keys = (await this.d1.prepare("SELECT key FROM avatar_assets WHERE folder_id = ?1 AND avatar_id = ?2 AND source_video IS NULL").bind(folder.id, folder.avatar_id).all<{ key: string }>()).results.map((r) => r.key);
    await this.d1.batch([
      this.d1.prepare(`UPDATE avatars SET photo_asset = NULL WHERE id = ?2 AND photo_asset IN (${inside})`).bind(folder.id, folder.avatar_id),
      this.d1.prepare(`UPDATE avatars SET voice_asset = NULL WHERE id = ?2 AND voice_asset IN (${inside})`).bind(folder.id, folder.avatar_id),
      this.d1.prepare("DELETE FROM avatar_assets WHERE folder_id = ?1 AND avatar_id = ?2").bind(folder.id, folder.avatar_id),
      drop,
    ]);
    return keys;
  }

  /** Põe o ativo numa pasta do avatar (ou fora de pasta). */
  async moveAsset(avatarId: string, assetId: string, folderId: string | null): Promise<void> {
    await this.d1.prepare("UPDATE avatar_assets SET folder_id = ? WHERE id = ? AND avatar_id = ?").bind(folderId, assetId, avatarId).run();
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

  /** Um aviso guardado em JSON na config (o alarme de contêiner, src/vigia.ts); null apaga. */
  async alarm<T>(key: string): Promise<T | null> {
    const row = await this.d1.prepare("SELECT value FROM config WHERE key = ?").bind(key).first<{ value: string }>();
    return row ? JSON.parse(row.value) : null;
  }

  async setAlarm(key: string, value: unknown): Promise<void> {
    if (value === null) await this.d1.prepare("DELETE FROM config WHERE key = ?").bind(key).run();
    else await this.d1.prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(key, JSON.stringify(value)).run();
  }

  /** Há tratamento de áudio ou edição rápida em andamento (os dois rodam no AudioFixer). */
  async audioWorking(): Promise<boolean> {
    return !!(await this.d1.prepare("SELECT 1 FROM videos WHERE audio_status = 'processing' OR edit_status = 'processing' LIMIT 1").first());
  }

  /** Há exportação em andamento (roda no Exporter). */
  async exportWorking(): Promise<boolean> {
    return !!(await this.d1.prepare("SELECT 1 FROM exports WHERE status = 'running' LIMIT 1").first());
  }

  /** O catálogo de vozes prontas da HeyGen guardado (config 'vozes.heygen.listadas'): ler tudo da API leva várias chamadas. */
  /** Um catálogo de vozes guardado (o da HeyGen e o do Fish), com a hora em que foi lido. */
  async voiceCatalog<T>(key = "vozes.heygen.listadas"): Promise<{ at: number; voices: T[] } | null> {
    const row = await this.d1.prepare("SELECT value FROM config WHERE key = ?").bind(key).first<{ value: string }>();
    return row ? JSON.parse(row.value) : null;
  }

  async setVoiceCatalog<T>(catalog: { at: number; voices: T[] }, key = "vozes.heygen.listadas"): Promise<void> {
    await this.d1.prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(key, JSON.stringify(catalog)).run();
  }

  async insertVoice(v: Omit<Voice, "created_at" | "error" | "asset_id" | "provider"> & { asset_id?: string | null; provider?: VoiceProvider }, now = new Date()): Promise<Voice> {
    return (await this.d1
      .prepare("INSERT INTO voices (id, user_id, name, provider_voice_id, status, asset_id, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(v.id, v.user_id, v.name, v.provider_voice_id, v.status, v.asset_id ?? null, v.provider ?? "heygen", now.toISOString())
      .first<Voice>())!;
  }

  /** As vozes da pessoa, as mais novas primeiro (as que falharam ficam de fora). */
  async voicesByUser(userId: number, provider: VoiceProvider = "heygen"): Promise<Voice[]> {
    return (await this.d1.prepare("SELECT * FROM voices WHERE user_id = ? AND provider = ? AND status != 'FAILED' ORDER BY created_at DESC").bind(userId, provider).all<Voice>()).results;
  }

  /** A voz que já saiu desta gravação do avatar. */
  voiceByAsset(assetId: string, provider: VoiceProvider = "heygen"): Promise<Voice | null> {
    return this.d1.prepare("SELECT * FROM voices WHERE asset_id = ? AND provider = ? AND status != 'FAILED' ORDER BY created_at DESC LIMIT 1").bind(assetId, provider).first<Voice>();
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
    return (
      await this.d1
        .prepare("SELECT * FROM projects WHERE user_id = ? AND name LIKE ? ESCAPE '\\' ORDER BY updated_at DESC, rowid DESC LIMIT ?")
        .bind(userId, like(q), limit)
        .all<Project>()
    ).results;
  }

  async saveProject(id: string, changes: { name?: string; data?: string }, revision?: number, now = new Date()): Promise<number | null> {
    const row = await this.d1
      .prepare("UPDATE projects SET name = COALESCE(?, name), data = COALESCE(?, data), revision = revision + 1, updated_at = ? WHERE id = ? AND (? IS NULL OR revision = ?) RETURNING revision")
      .bind(changes.name ?? null, changes.data ?? null, now.toISOString(), id, revision ?? null, revision ?? null)
      .first<{ revision: number }>();
    return row?.revision ?? null;
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
  /** As exportações do projeto que ainda andam ou que falharam desde `failedSince`, da mais nova à mais antiga. */
  async runningExports(projectId: string, failedSince?: string): Promise<ExportRow[]> {
    const sql = failedSince
      ? "SELECT * FROM exports WHERE project_id = ? AND (status = 'running' OR (status = 'failed' AND created_at > ?)) ORDER BY created_at DESC"
      : "SELECT * FROM exports WHERE project_id = ? AND status = 'running' ORDER BY created_at DESC";
    const q = this.d1.prepare(sql);
    return (await (failedSince ? q.bind(projectId, failedSince) : q.bind(projectId)).all<ExportRow>()).results;
  }

  /** A última exportação do projeto; com `versoes`, só as que fazem vídeo (não a cena do ver_cena). */
  async latestExport(projectId: string, versoes = false): Promise<ExportRow | null> {
    const so = versoes ? " AND json_array_length(plan, '$.versoes') > 0" : "";
    return this.d1.prepare(`SELECT * FROM exports WHERE project_id = ?${so} ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(projectId).first<ExportRow>();
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

  /** Troca só o plano (o prazo do link de download), sem mexer no andamento. */
  async setExportPlan(id: string, plan: string): Promise<ExportRow | null> {
    return this.d1.prepare("UPDATE exports SET plan = ? WHERE id = ? RETURNING *").bind(plan, id).first<ExportRow>();
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

  async projectFiles(projectId: string): Promise<ProjectFile[]> {
    return (await this.d1.prepare("SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC").bind(projectId).all<ProjectFile>()).results;
  }

  /** Apaga esses arquivos do projeto no banco e devolve as chaves deles no R2 (para apagar lá também). */
  async deleteProjectFiles(projectId: string, ids: string[]): Promise<string[]> {
    const keys: string[] = [];
    // Em partes: o D1 aceita até 100 valores por instrução.
    for (let i = 0; i < ids.length; i += 90) {
      const parte = ids.slice(i, i + 90);
      const marks = parte.map(() => "?").join(", ");
      keys.push(...(await this.d1.prepare(`SELECT key FROM project_files WHERE project_id = ? AND id IN (${marks})`).bind(projectId, ...parte).all<{ key: string }>()).results.map((r) => r.key));
      await this.d1.prepare(`DELETE FROM project_files WHERE project_id = ? AND id IN (${marks})`).bind(projectId, ...parte).run();
    }
    return keys;
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

  async userById(id: number): Promise<User | null> {
    const row = await this.d1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
    return row ? toUser(row) : null;
  }

  /** Cria a conta comum convidada (sem senha até ela aceitar o convite); null se o e-mail já tem conta. */
  async addMember(email: string, name: string, nowIso: string): Promise<User | null> {
    const row = await this.d1
      .prepare("INSERT INTO users (email, name, role, created_at) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING RETURNING *")
      .bind(email, name, nowIso)
      .first<UserRow>();
    return row ? toUser(row) : null;
  }

  /** As contas para a aba Contas do painel: o administrador primeiro, com o estado da senha e do convite. */
  async accounts(): Promise<AccountRow[]> {
    const rows = (
      await this.d1
        .prepare(
          `SELECT u.*, (SELECT MAX(i.expires_at) FROM invites i WHERE i.user_id = u.id) AS invite_until,
             (SELECT COUNT(*) FROM videos v WHERE v.user_id = u.id) AS videos
           FROM users u ORDER BY u.role = 'admin' DESC, u.created_at, u.id`,
        )
        .all<UserRow & { invite_until: string | null; videos: number }>()
    ).results;
    return rows.map((r) => ({ ...toUser(r), hasPassword: r.password_hash !== null, inviteUntil: r.invite_until, videos: r.videos }));
  }

  /** Grava os ajustes de permissão da conta (src/permissoes.ts). */
  async setPermissoes(userId: number, permissoes: string[]): Promise<void> {
    await this.d1.prepare("UPDATE users SET permissoes = ? WHERE id = ?").bind(JSON.stringify(permissoes), userId).run();
  }

  /** Encerra as sessões abertas da conta. */
  async endSessions(userId: number): Promise<void> {
    await this.d1.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  }

  /** Um link novo para a conta criar a senha: o anterior (e os vencidos) deixam de valer. */
  async addInvite(tokenHash: string, userId: number, nowIso: string, expiresIso: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("DELETE FROM invites WHERE user_id = ? OR expires_at <= ?").bind(userId, nowIso),
      this.d1.prepare("INSERT INTO invites (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(tokenHash, userId, nowIso, expiresIso),
    ]);
  }

  /** Guarda a simulação de um gerar_* do agente; as vencidas saem junto. */
  async addSimulacao(codigoHash: string, userId: number, pedido: string, custo: number | null, nowIso: string, expiresIso: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("DELETE FROM simulacoes WHERE expires_at <= ?").bind(nowIso),
      this.d1.prepare("INSERT INTO simulacoes (codigo_hash, user_id, pedido, custo, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(codigoHash, userId, pedido, custo, nowIso, expiresIso),
    ]);
  }

  /**
   * Gasta a simulação: só existe para a mesma conta e o mesmo pedido, dentro do prazo, e sai do
   * banco na mesma instrução (dois pedidos com o mesmo código: só um a recebe). Devolve o custo
   * que a pessoa viu, ou null se o código não vale.
   */
  async useSimulacao(codigoHash: string, userId: number, pedido: string, nowIso: string): Promise<{ custo: number | null } | null> {
    return this.d1
      .prepare("DELETE FROM simulacoes WHERE codigo_hash = ? AND user_id = ? AND pedido = ? AND expires_at > ? RETURNING custo")
      .bind(codigoHash, userId, pedido, nowIso)
      .first<{ custo: number | null }>();
  }

  /** A conta do link, se ele ainda vale. */
  async inviteUser(tokenHash: string, nowIso: string): Promise<UserLogin | null> {
    const row = await this.d1
      .prepare("SELECT u.* FROM invites i JOIN users u ON u.id = i.user_id WHERE i.token_hash = ? AND i.expires_at > ?")
      .bind(tokenHash, nowIso)
      .first<UserRow>();
    return row ? toUserLogin(row) : null;
  }

  /** Grava a senha nova, zera as tentativas erradas e derruba as sessões e os convites da conta. */
  async setPassword(userId: number, passwordHash: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").bind(passwordHash, userId),
      this.d1.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
      this.d1.prepare("DELETE FROM invites WHERE user_id = ?").bind(userId),
    ]);
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

  /** A conta dona do token. O último uso é anotado no máximo uma vez por hora. */
  async tokenUser(tokenHash: string, now = new Date()): Promise<User | null> {
    const row = await this.d1.prepare("SELECT u.* FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?").bind(tokenHash).first<UserRow>();
    if (!row) return null;
    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    await this.d1.prepare("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ? AND (last_used_at IS NULL OR last_used_at < ?)").bind(now.toISOString(), tokenHash, hourAgo).run();
    return toUser(row);
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
      this.d1.prepare("DELETE FROM folders"),
      this.d1.prepare("DELETE FROM account_folders"),
      this.d1.prepare("DELETE FROM avatars"),
      this.d1.prepare("DELETE FROM voices"),
      this.d1.prepare("UPDATE config SET value = 'openrouter' WHERE key = 'plataforma.heygen'"),
      this.d1.prepare("DELETE FROM config WHERE key = 'alarme.conteiner'"),
      this.d1.prepare("DELETE FROM sessions"),
      this.d1.prepare("DELETE FROM invites"),
      this.d1.prepare("DELETE FROM simulacoes"),
      this.d1.prepare("DELETE FROM api_tokens"),
      this.d1.prepare("DELETE FROM users"),
    ]);
  }
}

/** O trecho `%q%` do LIKE, com os curingas do texto escapados (ESCAPE '\\'). */
/**
 * Uma página de uma lista do agente: busca, datas e onde a página anterior parou (criado e id do
 * último). Toda lista ordena do mais novo ao mais antigo e para no mesmo ponto.
 */
export interface Pagina {
  q?: string;
  desde?: string;
  ate?: string;
  depois?: { criado: string; id: string };
  limite: number;
}

/** As condições de data e de continuação de uma `Pagina`, para a coluna `created_at` e o `id` da tabela. */
function pagina(f: Pagina, bind: (v: string | number) => string, t = ""): string[] {
  const where: string[] = [];
  if (f.desde) where.push(`${t}created_at >= ${bind(f.desde)}`);
  if (f.ate) where.push(`${t}created_at < ${bind(f.ate)}`);
  if (f.depois) {
    const criado = bind(f.depois.criado);
    where.push(`(${t}created_at < ${criado} OR (${t}created_at = ${criado} AND ${t}id < ${bind(f.depois.id)}))`);
  }
  return where;
}

function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * O banco visto por uma conta: toda consulta leva o dono (`user_id = ?1`), então o que é de
 * outra pessoa não existe aqui, nem pelo id. É o que as telas usam para ler os vídeos; o `Db`
 * fica com o que é do sistema (agendamento, painel, login). Toda SQL desta classe tem
 * `user_id = ?1` (test/dono.test.ts confere).
 */
export class ContaDb {
  constructor(
    private readonly d1: D1Database,
    readonly userId: number,
  ) {}

  /** O vídeo, se é desta conta. */
  video(id: string): Promise<Video | null> {
    return this.d1.prepare("SELECT * FROM videos WHERE user_id = ?1 AND id = ?2").bind(this.userId, id).first<Video>();
  }

  /** Dá nome ao vídeo (ou imagem); vazio tira o nome. Falso se o vídeo não é desta conta. */
  async renameVideo(id: string, name: string | null): Promise<boolean> {
    const r = await this.d1.prepare("UPDATE videos SET name = ?3 WHERE user_id = ?1 AND id = ?2").bind(this.userId, id, name).run();
    return r.meta.changes > 0;
  }

  /**
   * Os vídeos das estruturas, os mais novos primeiro, uma página por vez; com `q`, só os que têm o
   * trecho na fala ou no nome. `total` conta todos, e a página além da última vira a última.
   * `folder`: o id de uma pasta (só os dela), null (só os de fora de pasta) ou nada (todos, como
   * nas páginas dos modelos, que não têm pastas).
   */
  async videos(structures: string[], q = "", page = 1, size = 100, folder?: string | null): Promise<{ items: Video[]; total: number; page: number }> {
    if (!structures.length) return { items: [], total: 0, page: 1 };
    // Os modelos entram a partir de `first`: a contagem não tem o tamanho nem o começo da página.
    const rest = (first: number) =>
      `structure IN (${structures.map((_, i) => `?${i + first}`).join(", ")}) AND (prompt LIKE ?2 ESCAPE '\\' OR name LIKE ?2 ESCAPE '\\')${folder === undefined ? "" : folder === null ? " AND folder_id IS NULL" : ` AND folder_id = ?${first + structures.length}`}`;
    const pasta = folder ? [folder] : [];
    const count = await this.d1.prepare(`SELECT COUNT(*) AS n FROM videos WHERE user_id = ?1 AND ${rest(3)}`).bind(this.userId, like(q), ...structures, ...pasta).first<{ n: number }>();
    const total = count?.n ?? 0;
    const current = Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, Math.ceil(total / size)));
    const { results } = await this.d1
      .prepare(`SELECT * FROM videos WHERE user_id = ?1 AND ${rest(5)} ORDER BY created_at DESC, rowid DESC LIMIT ?3 OFFSET ?4`)
      .bind(this.userId, like(q), size, (current - 1) * size, ...structures, ...pasta)
      .all<Video>();
    return { items: results, total, page: current };
  }

  // --- Pastas da conta: a aba Vídeos e Projetos (simples, sem pasta dentro de pasta) ---

  /** As pastas de uma lista, pelo nome. */
  async folders(kind: FolderKind): Promise<AccountFolder[]> {
    return (await this.d1.prepare("SELECT * FROM account_folders WHERE user_id = ?1 AND kind = ?2 ORDER BY name COLLATE NOCASE, created_at").bind(this.userId, kind).all<AccountFolder>()).results;
  }

  /** A pasta, se é desta conta. */
  folder(id: string): Promise<AccountFolder | null> {
    return this.d1.prepare("SELECT * FROM account_folders WHERE user_id = ?1 AND id = ?2").bind(this.userId, id).first<AccountFolder>();
  }

  /** Cria a pasta, se a lista ainda tem menos de `max` (conferido na mesma instrução). Falso se já estava cheia. */
  async insertFolder(id: string, kind: FolderKind, name: string, max: number, now = new Date()): Promise<boolean> {
    const r = await this.d1
      .prepare("INSERT INTO account_folders (id, user_id, kind, name, created_at) SELECT ?2, ?1, ?3, ?4, ?5 WHERE (SELECT COUNT(*) FROM account_folders WHERE user_id = ?1 AND kind = ?3) < ?6")
      .bind(this.userId, id, kind, name, now.toISOString(), max)
      .run();
    return r.meta.changes > 0;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    await this.d1.prepare("UPDATE account_folders SET name = ?3 WHERE user_id = ?1 AND id = ?2").bind(this.userId, id, name).run();
  }

  /** Apaga só a pasta: os vídeos ou os projetos dela voltam para a lista. Nada mais é apagado. */
  async deleteFolder(folder: AccountFolder): Promise<void> {
    const table = folder.kind === "videos" ? "videos" : "projects";
    await this.d1.batch([
      this.d1.prepare(`UPDATE ${table} SET folder_id = NULL WHERE user_id = ?1 AND folder_id = ?2`).bind(this.userId, folder.id),
      this.d1.prepare("DELETE FROM account_folders WHERE user_id = ?1 AND id = ?2").bind(this.userId, folder.id),
    ]);
  }

  /** Quantos itens cada pasta da lista tem; nos vídeos, só os das estruturas dadas. */
  async folderCounts(kind: FolderKind, structures: string[] = []): Promise<Map<string, number>> {
    if (kind === "videos" && !structures.length) return new Map();
    const sql =
      kind === "videos"
        ? `SELECT folder_id, COUNT(*) AS n FROM videos WHERE user_id = ?1 AND folder_id IS NOT NULL AND structure IN (${structures.map((_, i) => `?${i + 2}`).join(", ")}) GROUP BY folder_id`
        : "SELECT folder_id, COUNT(*) AS n FROM projects WHERE user_id = ?1 AND folder_id IS NOT NULL GROUP BY folder_id";
    const { results } = await this.d1.prepare(sql).bind(this.userId, ...(kind === "videos" ? structures : [])).all<{ folder_id: string; n: number }>();
    return new Map(results.map((r) => [r.folder_id, r.n]));
  }

  /** Põe o vídeo numa pasta (ou fora de pasta), sem mexer no updated_at (não é uma mudança do vídeo). Falso se o vídeo não é desta conta. */
  async moveVideo(id: string, folderId: string | null): Promise<boolean> {
    const r = await this.d1.prepare("UPDATE videos SET folder_id = ?3 WHERE user_id = ?1 AND id = ?2").bind(this.userId, id, folderId).run();
    return r.meta.changes > 0;
  }

  /** Põe o projeto numa pasta (ou fora de pasta), sem contar como edição do projeto. */
  async moveProject(id: string, folderId: string | null): Promise<boolean> {
    const r = await this.d1.prepare("UPDATE projects SET folder_id = ?3 WHERE user_id = ?1 AND id = ?2").bind(this.userId, id, folderId).run();
    return r.meta.changes > 0;
  }

  /** Os projetos de uma pasta da conta (para apagar junto com ela). */
  async projectsInFolder(folderId: string): Promise<string[]> {
    return (await this.d1.prepare("SELECT id FROM projects WHERE user_id = ?1 AND folder_id = ?2").bind(this.userId, folderId).all<{ id: string }>()).results.map((r) => r.id);
  }

  /**
   * Os vídeos (ou imagens) prontos, de todos os modelos dados, os mais novos primeiro e uma
   * página por vez: o "Adicionar ativo" do painel do modelo os oferece como referência.
   */
  async ready(structures: string[], from = 0, limit = 12): Promise<Video[]> {
    if (!structures.length) return [];
    return (
      await this.d1
        .prepare(`SELECT * FROM videos WHERE user_id = ?1 AND structure IN (${structures.map((_, i) => `?${i + 4}`).join(", ")}) AND status = 'completed' AND video_key IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT ?2 OFFSET ?3`)
        .bind(this.userId, limit, from, ...structures)
        .all<Video>()
    ).results;
  }

  /**
   * Os vídeos (e imagens) prontos, com arquivo, das estruturas, do mais novo ao mais antigo, uma
   * página por vez; com `avatar`, só os gerados com ele. Os filtros de página são os de toda lista
   * do agente (`Pagina`).
   */
  async readyVideos(structures: string[], f: Pagina & { avatar?: string }): Promise<Video[]> {
    if (!structures.length) return [];
    const binds: (string | number)[] = [this.userId, like(f.q ?? "")];
    const bind = (v: string | number) => `?${binds.push(v)}`;
    const where = [`structure IN (${structures.map(bind).join(", ")})`, "status = 'completed'", "video_key IS NOT NULL", "(prompt LIKE ?2 ESCAPE '\\' OR name LIKE ?2 ESCAPE '\\')"];
    if (f.avatar) where.push(`avatar_id = ${bind(f.avatar)}`);
    return (await this.d1.prepare(`SELECT * FROM videos WHERE user_id = ?1 AND ${[...where, ...pagina(f, bind)].join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ${bind(f.limite)}`).bind(...binds).all<Video>()).results;
  }

  /** Os ativos dos avatares da conta, com o nome do avatar, uma página por vez (como `readyVideos`). */
  async assetsPage(f: Pagina & { kind?: AssetKind; avatar?: string }): Promise<(AvatarAsset & { avatar_name: string })[]> {
    const binds: (string | number)[] = [this.userId, like(f.q ?? "")];
    const bind = (v: string | number) => `?${binds.push(v)}`;
    const where = ["x.name LIKE ?2 ESCAPE '\\'"];
    if (f.kind) where.push(`x.kind = ${bind(f.kind)}`);
    if (f.avatar) where.push(`x.avatar_id = ${bind(f.avatar)}`);
    return (
      await this.d1
        .prepare(`SELECT x.*, a.name AS avatar_name FROM avatar_assets x JOIN avatars a ON a.id = x.avatar_id WHERE a.user_id = ?1 AND ${[...where, ...pagina(f, bind, "x.")].join(" AND ")} ORDER BY x.created_at DESC, x.id DESC LIMIT ${bind(f.limite)}`)
        .bind(...binds)
        .all<AvatarAsset & { avatar_name: string }>()
    ).results;
  }

  /** Os arquivos enviados aos projetos da conta (ou a um deles), com o nome do projeto, uma página por vez. */
  async projectFilesPage(f: Pagina & { types?: string[]; project?: string }): Promise<(ProjectFile & { project_name: string })[]> {
    const binds: (string | number)[] = [this.userId, like(f.q ?? "")];
    const bind = (v: string | number) => `?${binds.push(v)}`;
    const where = ["f.name LIKE ?2 ESCAPE '\\'"];
    if (f.types) where.push(f.types.length ? `f.type IN (${f.types.map(bind).join(", ")})` : "0");
    if (f.project) where.push(`f.project_id = ${bind(f.project)}`);
    return (
      await this.d1
        .prepare(`SELECT f.*, p.name AS project_name FROM project_files f JOIN projects p ON p.id = f.project_id WHERE p.user_id = ?1 AND ${[...where, ...pagina(f, bind, "f.")].join(" AND ")} ORDER BY f.created_at DESC, f.id DESC LIMIT ${bind(f.limite)}`)
        .bind(...binds)
        .all<ProjectFile & { project_name: string }>()
    ).results;
  }

  /** O avatar de cada vídeo da conta (os que têm), para saber que avatar um projeto usa. */
  async videoAvatars(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 90) {
      const parte = ids.slice(i, i + 90);
      const rows = await this.d1
        .prepare(`SELECT id, avatar_id FROM videos WHERE user_id = ?1 AND avatar_id IS NOT NULL AND id IN (${parte.map((_, j) => `?${j + 2}`).join(",")})`)
        .bind(this.userId, ...parte)
        .all<{ id: string; avatar_id: string }>();
      for (const r of rows.results) out.set(r.id, r.avatar_id);
    }
    return out;
  }

  /** Quantos vídeos a conta tem em cada estrutura. */
  async countByStructure(): Promise<Map<string, number>> {
    const rows = (await this.d1.prepare("SELECT structure, COUNT(*) AS n FROM videos WHERE user_id = ?1 GROUP BY structure").bind(this.userId).all<{ structure: string | null; n: number }>()).results;
    return new Map(rows.map((r) => [r.structure ?? "", r.n]));
  }

  /**
   * As últimas instruções (`extra`) usadas com cada avatar nestes modelos, para o campo voltar
   * preenchido ao escolher o avatar (`perAvatar`). Avatar sem vídeo fica de fora.
   */
  async lastExtraByAvatar(structures: string[]): Promise<Map<string, string>> {
    if (!structures.length) return new Map();
    const rows = (
      await this.d1
        .prepare(`SELECT avatar_id, extra FROM videos WHERE user_id = ?1 AND structure IN (${structures.map((_, i) => `?${i + 2}`).join(", ")}) AND avatar_id IS NOT NULL AND extra IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 500`)
        .bind(this.userId, ...structures)
        .all<{ avatar_id: string; extra: string }>()
    ).results;
    const last = new Map<string, string>();
    for (const r of rows) if (!last.has(r.avatar_id)) last.set(r.avatar_id, r.extra);
    return last;
  }
}
