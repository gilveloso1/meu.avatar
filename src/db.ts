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
  created_at: string;
  updated_at: string;
}

export type NewVideo = Pick<Video, "id" | "prompt" | "model" | "duration" | "resolution" | "aspect_ratio" | "image_key">;
export type VideoChanges = Partial<Pick<Video, "job_id" | "status" | "video_key" | "cost" | "error">>;

/** Status em que o vídeo ainda pode mudar (vale consultar o OpenRouter). */
export const OPEN_STATUSES: VideoStatus[] = ["pending", "in_progress"];

export class Db {
  constructor(private readonly d1: D1Database) {}

  async insertVideo(v: NewVideo, now = new Date()): Promise<Video> {
    const at = now.toISOString();
    return (await this.d1
      .prepare(
        `INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, image_key, created_at, updated_at)
         VALUES (?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(v.id, v.prompt, v.model, v.duration, v.resolution, v.aspect_ratio, v.image_key, at, at)
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

  /** Só nos testes. */
  async resetAll(): Promise<void> {
    await this.d1.prepare("DELETE FROM videos").run();
  }
}
