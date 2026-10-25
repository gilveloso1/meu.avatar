import type { AudioApi } from "./audio";
import { Db, OPEN_STATUSES, type Role, type Video } from "./db";
import { validate, type VideoApi, type VideoJob, type VideoModel, type VideoRequest } from "./openrouter";
import { canUse, InputError, structureById, type Structure, type Values } from "./structures";

export { InputError } from "./structures";

export interface StudioConfig {
  /** Endereço público, sem barra no fim. */
  siteUrl: string;
}

export interface NewVideoInput {
  /** A estrutura do modelo escolhido (src/structures/). */
  structure: Structure;
  /** Os campos do formulário dessa estrutura. */
  values: Values;
  /** Foto do avatar. */
  image?: File | null;
  /** Quem está pedindo. */
  user: { id: number; role: Role };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** Depois disso, um tratamento de áudio que não terminou conta como falha. */
export const AUDIO_TIMEOUT_MS = 20 * 60_000;

/** Limite da foto do avatar (o Worker guarda no R2 e o provedor baixa de lá). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** A estrutura existe, mas quem pediu não tem acesso a ela. */
export class ForbiddenError extends Error {}

/**
 * Pede os vídeos ao OpenRouter e acompanha até o MP4 estar no R2. O aviso do
 * OpenRouter (webhook) só serve de gatilho: o status é sempre conferido na
 * API, e o agendamento confere os que ficaram abertos caso o aviso se perca.
 */
export class Studio {
  private models = new Map<string, Promise<VideoModel>>();

  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly api: VideoApi | null,
    private readonly config: StudioConfig,
    /** Contêiner que trata o áudio; sem ele, o vídeo fica como veio do modelo. */
    private readonly audio: AudioApi | null = null,
  ) {}

  get canGenerate(): boolean {
    return this.api !== null;
  }

  model(id: string): Promise<VideoModel> {
    const api = this.requireApi();
    let model = this.models.get(id);
    if (!model) this.models.set(id, (model = api.getModel(id)));
    return model;
  }

  /** Confere o acesso, valida pela estrutura, guarda a foto, registra o vídeo e envia o pedido. */
  async create(input: NewVideoInput): Promise<Video> {
    const { structure } = input;
    if (!canUse(structure, input.user.role)) throw new ForbiddenError(`Sem acesso a ${structure.name}.`);
    const api = this.requireApi();

    const image = input.image && input.image.size > 0 ? input.image : null;
    const ext = image ? IMAGE_TYPES[image.type] : undefined;
    if (image && !ext) throw new InputError("A foto precisa ser JPG, PNG ou WebP.");
    if (image && image.size > MAX_IMAGE_BYTES) throw new InputError("A foto passa de 10 MB.");

    const model = await this.model(structure.model);
    const built = structure.build(input.values, image !== null, model);
    const request: VideoRequest = { model: structure.model, ...built.request };
    const placeholder = { type: "image_url" as const, image_url: { url: "" } };
    if (built.image === "first_frame") request.frame_images = [{ ...placeholder, frame_type: "first_frame" }];
    if (built.image === "reference") request.input_references = [placeholder];
    const errors = validate(model, request);
    if (errors.length) throw new InputError(`Não suportado por ${structure.model}: ${errors.join("; ")}.`);

    const id = crypto.randomUUID();
    let imageKey: string | null = null;
    if (image && built.image) {
      // Nome impossível de adivinhar: a foto fica pública só para o provedor baixar.
      imageKey = `avatares/${crypto.randomUUID()}.${ext}`;
      const bytes = await image.arrayBuffer();
      await this.media.put(imageKey, bytes, { httpMetadata: { contentType: image.type } });
      placeholder.image_url.url = await this.imageUrl(imageKey, image.type, bytes);
    }
    if (this.config.siteUrl.startsWith("https://")) request.callback_url = `${this.config.siteUrl}/openrouter/webhook`;

    const { settings, ...record } = built.record;
    const video = await this.db.insertVideo({
      id,
      ...record,
      model: structure.model,
      image_key: imageKey,
      user_id: input.user.id,
      structure: structure.id,
      settings: settings ? JSON.stringify(settings) : null,
    });

    try {
      const job = await api.submit(request);
      return (await this.db.updateVideo(id, { job_id: job.id, status: job.status ?? "pending" }))!;
    } catch (err) {
      return (await this.db.updateVideo(video.id, { status: "failed", error: errorMessage(err) }))!;
    }
  }

  /** Confere o job no OpenRouter e, se terminou, guarda o MP4 no R2. */
  async sync(video: Video): Promise<Video> {
    if (!video.job_id || !OPEN_STATUSES.includes(video.status)) return video;
    const api = this.requireApi();
    let job: VideoJob;
    try {
      job = await api.get(video.job_id);
    } catch (err) {
      console.error("Falha ao consultar o job", video.job_id, err);
      return video;
    }

    if (job.status === "completed") {
      const key = `videos/${video.id}.mp4`;
      await this.media.put(key, await api.download(job), { httpMetadata: { contentType: "video/mp4" } });
      return (await this.db.updateVideo(video.id, {
        status: "completed",
        video_key: key,
        cost: job.usage?.cost ?? null,
        // O áudio entra na fila do contêiner, se a estrutura pede; o agendamento trata um por vez.
        audio_status: this.audio && (structureById(video.structure)?.treatAudio ?? true) ? "pending" : null,
      }))!;
    }
    if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") {
      return (await this.db.updateVideo(video.id, { status: job.status, error: job.error ?? null, cost: job.usage?.cost ?? null }))!;
    }
    if (job.status !== video.status) return (await this.db.updateVideo(video.id, { status: job.status }))!;
    return video;
  }

  /** Aviso do OpenRouter: acha o vídeo pelo id do job e confere. */
  async onWebhook(payload: unknown): Promise<Video | null> {
    const jobId = (payload as { data?: { id?: unknown } } | null)?.data?.id;
    if (typeof jobId !== "string") return null;
    const video = await this.db.videoByJob(jobId);
    return video ? this.sync(video) : null;
  }

  /** Agendamento: confere os vídeos ainda abertos. */
  async syncOpen(limit = 10): Promise<Video[]> {
    if (!this.api) return [];
    const done: Video[] = [];
    for (const video of await this.db.openVideos(limit)) done.push(await this.sync(video));
    return done;
  }

  /**
   * Agendamento: trata o áudio do próximo vídeo da fila no contêiner e guarda
   * a versão tratada ao lado do original. Um vídeo por rodada (uns 2 min).
   */
  async treatNextAudio(now = new Date()): Promise<Video | null> {
    if (!this.audio) return null;
    await this.db.failStaleAudio(new Date(now.getTime() - AUDIO_TIMEOUT_MS).toISOString(), now.toISOString());
    const video = await this.db.claimAudio(now.toISOString());
    if (!video) return null;
    try {
      const original = video.video_key ? await this.media.get(video.video_key) : null;
      if (!original) throw new Error("O vídeo original não está no R2.");
      const res = await this.audio.treat(original.body, original.size);
      // Repassa o MP4 tratado direto para o R2, sem carregar tudo na memória do Worker.
      const size = Number(res.headers.get("content-length"));
      const key = `videos/${video.id}.tratado.mp4`;
      const stream = new FixedLengthStream(size);
      await Promise.all([res.body!.pipeTo(stream.writable), this.media.put(key, stream.readable, { httpMetadata: { contentType: "video/mp4" } })]);
      return (await this.db.updateVideo(video.id, { audio_status: "done", processed_key: key, audio_error: null }))!;
    } catch (err) {
      console.error("Falha ao tratar o áudio", video.id, err);
      return (await this.db.updateVideo(video.id, { audio_status: "failed", audio_error: errorMessage(err) }))!;
    }
  }

  /**
   * O provedor baixa a foto pela URL pública do Worker. Em desenvolvimento
   * (localhost), essa URL não é alcançável de fora: vai a foto em base64.
   */
  private async imageUrl(key: string, type: string, bytes: ArrayBuffer): Promise<string> {
    if (this.config.siteUrl.startsWith("https://")) return `${this.config.siteUrl}/midia/${key}`;
    let binary = "";
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(binary)}`;
  }

  private requireApi(): VideoApi {
    if (!this.api) throw new InputError("Falta a chave do OpenRouter (segredo OPENROUTER_API_KEY).");
    return this.api;
  }
}

export function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}
