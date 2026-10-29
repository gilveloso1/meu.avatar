import type { AudioApi, Face } from "./audio";
import { Db, OPEN_STATUSES, type Role, type Video } from "./db";
import { ERROS } from "./erros";
import { mp4Duration, mp4Size } from "./mp4";
import { type InputReference, validate, type VideoApi, type VideoJob, type VideoModel, type VideoRequest } from "./openrouter";
import { containerPlan, DEFAULT_CAMERA, DEFAULT_PAUSE, type EditPlan, storedFace } from "./quickedit";
import { canUse, InputError, structureById, type Structure, type Values } from "./structures";
import { aspectLabel, CHECK_MODEL, CHECK_PROMPT, FACE_MODEL, FACE_TRIES, facePrompt, keyframeTimes, MAX_PREPARED_BYTES, parseCheck } from "./structures/aleph";

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
  /** Vídeo de origem (estruturas que recebem um vídeo, como a troca de avatar). */
  video?: File | null;
  /** Quem está pedindo. */
  user: { id: number; role: Role };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** Depois disso, um tratamento de áudio (ou uma edição rápida) que não terminou conta como falha. */
export const AUDIO_TIMEOUT_MS = 20 * 60_000;

/** Limite da foto do avatar (o Worker guarda no R2 e o provedor baixa de lá). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
/** Limite do vídeo de origem: o do Seedance para vídeo de referência. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

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
    if (!canUse(structure, input.user.role)) throw new ForbiddenError(ERROS.semAcessoModelo);
    const api = this.requireApi();

    const image = input.image && input.image.size > 0 ? input.image : null;
    const ext = image ? IMAGE_TYPES[image.type] : undefined;
    if (image && !ext) throw new InputError(ERROS.fotoTipo);
    if (image && image.size > MAX_IMAGE_BYTES) throw new InputError(ERROS.fotoTamanho);

    const upload = input.video && input.video.size > 0 ? input.video : null;
    const videoExt = upload ? VIDEO_TYPES[upload.type] : undefined;
    if (upload && !videoExt) throw new InputError(ERROS.videoTipo);
    if (upload && upload.size > MAX_VIDEO_BYTES) throw new InputError(ERROS.videoTamanho(MAX_VIDEO_BYTES / 1024 / 1024));
    const videoBytes = upload ? await upload.arrayBuffer() : null;
    const seconds = videoBytes ? mp4Duration(videoBytes) : null;
    if (videoBytes && seconds === null) throw new InputError(ERROS.videoLeitura);

    const model = await this.model(structure.model);
    const built = structure.build(input.values, image !== null, model, seconds !== null ? { seconds } : null);
    // O preparo (Aleph 2) roda no contêiner: sem ele, não dá para começar.
    if (built.prepare && !this.audio) throw new InputError(ERROS.trocaIndisponivel);
    const request: VideoRequest = { model: structure.model, ...built.request };
    const placeholder = { type: "image_url" as const, image_url: { url: "" } };
    const source = { type: "video_url" as const, video_url: { url: "" } };
    const references: InputReference[] = [];
    if (built.video) references.push(source);
    if (built.image === "first_frame") request.frame_images = [{ ...placeholder, frame_type: "first_frame" }];
    if (built.image === "reference") references.push(placeholder);
    if (references.length) request.input_references = references;
    const errors = validate(model, request);
    if (errors.length) {
      console.error(`Não suportado por ${structure.model}: ${errors.join("; ")}`);
      throw new InputError(ERROS.ajustesNaoAceitos);
    }

    const id = crypto.randomUUID();
    let imageKey: string | null = null;
    if (image && built.image) {
      // Nome impossível de adivinhar: a foto fica pública só para o provedor baixar.
      imageKey = `avatares/${crypto.randomUUID()}.${ext}`;
      const bytes = await image.arrayBuffer();
      await this.media.put(imageKey, bytes, { httpMetadata: { contentType: image.type } });
      if (!built.prepare) placeholder.image_url.url = await this.imageUrl(imageKey, image.type, bytes);
    }
    let sourceKey: string | null = null;
    if (upload && videoBytes && built.video) {
      // Como a foto: nome impossível de adivinhar, público só para o provedor baixar.
      sourceKey = `origens/${crypto.randomUUID()}.${videoExt}`;
      await this.media.put(sourceKey, videoBytes, { httpMetadata: { contentType: upload.type } });
      if (!built.prepare) source.video_url.url = await this.imageUrl(sourceKey, upload.type, videoBytes);
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
      settings: settings || sourceKey ? JSON.stringify({ ...settings, ...(sourceKey ? { source_key: sourceKey } : {}) }) : null,
    });

    // O pedido sai depois, da fila de preparo (prepareNext).
    if (built.prepare) return (await this.db.updateVideo(id, { prep_status: "pending" }))!;

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

    // O que o preparo já gastou (as imagens dos quadros-chave do Aleph 2) entra no custo.
    const prepCost = Number(parseSettings(video.settings).prep_cost) || 0;
    const cost = job.usage?.cost != null ? job.usage.cost + prepCost : null;
    if (job.status === "completed") {
      const key = `videos/${video.id}.mp4`;
      await this.media.put(key, await api.download(job), { httpMetadata: { contentType: "video/mp4" } });
      return (await this.db.updateVideo(video.id, {
        status: "completed",
        video_key: key,
        cost,
        // O áudio entra na fila do contêiner, se a estrutura pede; o agendamento trata um por vez.
        audio_status: this.audio && (structureById(video.structure)?.treatAudio ?? true) ? "pending" : null,
      }))!;
    }
    if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") {
      return (await this.db.updateVideo(video.id, { status: job.status, error: job.error ?? null, cost }))!;
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

  /**
   * Agendamento: prepara o próximo vídeo da fila de preparo (troca de avatar
   * pelo Aleph 2, src/structures/aleph.ts) e envia ao OpenRouter. Um por
   * rodada (uns 2 min: o contêiner e as imagens dos quadros-chave).
   */
  async prepareNext(now = new Date()): Promise<Video | null> {
    if (!this.audio || !this.api) return null;
    await this.db.failStalePrep(new Date(now.getTime() - AUDIO_TIMEOUT_MS).toISOString(), now.toISOString());
    const video = await this.db.claimPrep(now.toISOString());
    if (!video) return null;
    try {
      return await this.prepare(video, this.api, this.audio);
    } catch (err) {
      console.error("Falha no preparo", video.id, err);
      return (await this.db.updateVideo(video.id, { prep_status: "failed", prep_error: errorMessage(err), status: "failed", error: errorMessage(err) }))!;
    }
  }

  private async prepare(video: Video, api: VideoApi, audio: AudioApi): Promise<Video> {
    const settings = parseSettings(video.settings);
    if (!settings.source_key || !video.image_key) throw new Error("Faltam o vídeo de origem ou a foto no registro.");

    // 1. O vídeo sem faixas pretas e ampliado até 1080p.
    const preparedKey = `origens/${video.id}.preparado.mp4`;
    await this.runInContainer(settings.source_key, preparedKey, (body, size) => audio.prepare(body, size));
    const prepared = await (await this.media.get(preparedKey))!.arrayBuffer();
    const seconds = mp4Duration(prepared);
    const size = mp4Size(prepared);
    if (!seconds || !size) throw new Error("O vídeo preparado não tem duração ou tamanho legíveis.");
    if (prepared.byteLength > MAX_PREPARED_BYTES) throw new Error(`O vídeo preparado tem ${prepared.byteLength} bytes; o Aleph aceita até ${MAX_PREPARED_BYTES}.`);

    // 2. Os quadros, a foto e o recorte do rosto dela.
    const times = keyframeTimes(seconds);
    const frames = await audio.frames(prepared, times);
    const photoObject = await this.media.get(video.image_key);
    if (!photoObject) throw new Error("A foto do avatar não está no R2.");
    const photo = await photoObject.arrayBuffer();
    const photoUrl = `data:${photoObject.httpMetadata?.contentType ?? "image/jpeg"};base64,${base64(photo)}`;
    const crop = await audio.faceCrop(photo);

    // 3. O rosto trocado em cada quadro, conferido contra o original; o reprovado é refeito uma vez.
    let prepCost = 0;
    const keyframe = async (frame: string, at: number): Promise<{ at: number; image: string } | null> => {
      const original = `data:image/jpeg;base64,${frame}`;
      for (let attempt = 1; attempt <= FACE_TRIES; attempt++) {
        const edit = await api.chat({
          model: FACE_MODEL,
          modalities: ["image", "text"],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: facePrompt(crop !== null) },
                { type: "image_url", image_url: { url: original } },
                { type: "image_url", image_url: { url: photoUrl } },
                ...(crop ? [{ type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${crop}` } }] : []),
              ],
            },
          ],
        });
        prepCost += edit.cost;
        const edited = edit.images[0]?.replace(/^data:[^,]*,/, "");
        if (!edited) {
          console.error("Troca do rosto sem imagem", video.id, at, edit.text.slice(0, 300));
          continue;
        }
        const image = await audio.resize(edited, size.width, size.height);
        const check = await api.chat({
          model: CHECK_MODEL,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: CHECK_PROMPT },
                { type: "image_url", image_url: { url: original } },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
              ],
            },
          ],
        });
        prepCost += check.cost;
        const verdict = parseCheck(check.text);
        if (verdict && !verdict.fundo) return { at, image };
        console.error("Quadro-chave reprovado na conferência do fundo", video.id, at, attempt, check.text.slice(0, 300));
      }
      return null;
    };
    const accepted = (await Promise.all(frames.map((frame, i) => keyframe(frame, times[i]!)))).filter((k): k is { at: number; image: string } => k !== null);
    if (!accepted.length) throw new Error("Nenhum quadro-chave passou na conferência do fundo.");

    // 4. Os quadros-chave no R2 (o provedor baixa de lá) e o pedido ao Aleph.
    const keyframes = await Promise.all(
      accepted.map(async ({ at, image }, i) => {
        const key = `quadros/${video.id}/${i}.jpg`;
        const bytes = fromBase64(image);
        await this.media.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
        return { seconds: at, uri: await this.imageUrl(key, "image/jpeg", bytes) };
      }),
    );
    const request: VideoRequest = {
      model: video.model,
      prompt: video.request_prompt ?? "",
      input_references: [{ type: "video_url", video_url: { url: await this.imageUrl(preparedKey, "video/mp4", prepared) } }],
      provider: { options: { runway: { keyframes } } },
    };
    if (this.config.siteUrl.startsWith("https://")) request.callback_url = `${this.config.siteUrl}/openrouter/webhook`;
    const record = {
      duration: Math.round(seconds),
      resolution: `${Math.min(size.width, size.height)}p`,
      aspect_ratio: aspectLabel(size.width, size.height),
      settings: JSON.stringify({ ...settings, prepared_key: preparedKey, keyframes: String(accepted.length), prep_cost: prepCost.toFixed(4) }),
    };
    const job = await api.submit(request);
    return (await this.db.updateVideo(video.id, { ...record, job_id: job.id, status: job.status ?? "pending", prep_status: "done", prep_error: null }))!;
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
      const key = `videos/${video.id}.tratado.mp4`;
      await this.runInContainer(video.video_key, key, (body, size) => this.audio!.treat(body, size));
      return (await this.db.updateVideo(video.id, { audio_status: "done", processed_key: key, audio_error: null }))!;
    } catch (err) {
      console.error("Falha ao tratar o áudio", video.id, err);
      return (await this.db.updateVideo(video.id, { audio_status: "failed", audio_error: errorMessage(err) }))!;
    }
  }

  /**
   * "Gerar vídeo editado", na prévia da edição rápida: confere o acesso e se o
   * vídeo pode ser editado, e põe na fila do contêiner com o plano. Pedir de
   * novo refaz a edição.
   */
  async requestQuickEdit(video: Video, user: { role: Role }, plan: EditPlan, now = new Date()): Promise<Video> {
    const structure = structureById(video.structure);
    if (!structure || !canUse(structure, user.role)) throw new ForbiddenError(ERROS.semAcessoVideo);
    if (!structure.quickEdit) throw new InputError(ERROS.semEdicaoRapida);
    if (!this.audio) throw new InputError(ERROS.edicaoIndisponivel);
    if (video.status !== "completed" || !video.video_key) throw new InputError(ERROS.videoNaoPronto);
    if (video.audio_status === "pending" || video.audio_status === "processing") throw new InputError(ERROS.audioEmTratamento);
    const queued = await this.db.queueEdit(video.id, JSON.stringify(plan), now.toISOString());
    if (!queued) throw new InputError(ERROS.edicaoEmAndamento);
    return queued;
  }

  /**
   * Onde está o rosto do vídeo, para o zoom da edição rápida: o guardado ou,
   * na primeira vez, o que o contêiner achar (e fica guardado). Sem contêiner
   * ou se ele falhar, null (a prévia usa o padrão).
   */
  async face(video: Video, user: { role: Role }): Promise<Face | null> {
    const structure = structureById(video.structure);
    if (!structure || !canUse(structure, user.role)) throw new ForbiddenError(ERROS.semAcessoVideo);
    if (!structure.quickEdit) throw new InputError(ERROS.semEdicaoRapida);
    if (video.face) {
      try {
        return JSON.parse(video.face) as Face;
      } catch {
        // Guardado ilegível: acha de novo.
      }
    }
    const key = video.processed_key ?? video.video_key;
    if (!this.audio || !key) return null;
    const original = await this.media.get(key);
    if (!original) return null;
    try {
      const face = await this.audio.face(await original.arrayBuffer());
      await this.db.updateVideo(video.id, { face: JSON.stringify(face) });
      return face;
    } catch (err) {
      console.error("Falha ao achar o rosto", video.id, err);
      return null;
    }
  }

  /**
   * Agendamento: procura o rosto de um vídeo pronto que ainda não tem (para enquadrar a miniatura
   * nas listas e já deixar pronto para a edição rápida). Sem rosto ou se o contêiner falhar, grava
   * {} para não tentar de novo a cada minuto (a prévia da edição rápida usa o padrão).
   */
  async findNextFace(): Promise<Video | null> {
    if (!this.audio) return null;
    const video = await this.db.nextWithoutFace();
    if (!video) return null;
    let face: Face | Record<string, never> = {};
    try {
      const original = await this.media.get((video.processed_key ?? video.video_key)!);
      if (original) face = await this.audio.face(await original.arrayBuffer());
    } catch (err) {
      console.error("Falha ao achar o rosto (agendamento)", video.id, err);
    }
    return this.db.updateVideo(video.id, { face: JSON.stringify(face) });
  }

  /** Agendamento: faz a edição rápida do próximo vídeo da fila, a partir da versão com o áudio tratado, se houver. */
  async editNext(now = new Date()): Promise<Video | null> {
    if (!this.audio) return null;
    await this.db.failStaleEdit(new Date(now.getTime() - AUDIO_TIMEOUT_MS).toISOString(), now.toISOString());
    const video = await this.db.claimEdit(now.toISOString());
    if (!video) return null;
    try {
      const key = `videos/${video.id}.editado.mp4`;
      const plan = parseStoredPlan(video.edit_plan);
      // O rosto achado na prévia; sem ele, o contêiner acha sozinho.
      const face = storedFace(video.face);
      await this.runInContainer(video.processed_key ?? video.video_key, key, (body, size) => this.audio!.edit(body, size, containerPlan(plan, face)));
      // A edição que vale passa a ser esta: guarda quando e com que escolhas (a página mostra e o endereço muda).
      return (await this.db.updateVideo(video.id, { edit_status: "done", edited_key: key, edited_at: now.toISOString(), edited_plan: video.edit_plan, edit_error: null }))!;
    } catch (err) {
      console.error("Falha na edição rápida", video.id, err);
      return (await this.db.updateVideo(video.id, { edit_status: "failed", edit_error: errorMessage(err) }))!;
    }
  }

  /** Manda o MP4 do R2 para o contêiner e grava a resposta em `to`, sem carregar tudo na memória do Worker. */
  private async runInContainer(from: string | null, to: string, run: (body: ReadableStream, size: number) => Promise<Response>): Promise<void> {
    const original = from ? await this.media.get(from) : null;
    if (!original) throw new Error("O vídeo original não está no R2.");
    const res = await run(original.body, original.size);
    const stream = new FixedLengthStream(Number(res.headers.get("content-length")));
    await Promise.all([res.body!.pipeTo(stream.writable), this.media.put(to, stream.readable, { httpMetadata: { contentType: "video/mp4" } })]);
  }

  /**
   * O provedor baixa a foto (ou o vídeo de origem) pela URL pública do Worker.
   * Em desenvolvimento (localhost), essa URL não é alcançável de fora: vai o
   * arquivo em base64.
   */
  private async imageUrl(key: string, type: string, bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
    if (this.config.siteUrl.startsWith("https://")) return `${this.config.siteUrl}/midia/${key}`;
    return `data:${type};base64,${base64(bytes)}`;
  }

  private requireApi(): VideoApi {
    if (!this.api) throw new InputError(ERROS.criacaoPausada);
    return this.api;
  }
}

/** As configurações da estrutura guardadas no vídeo (JSON); ilegíveis, vazias. */
function parseSettings(json: string | null): Record<string, string> {
  try {
    return json ? (JSON.parse(json) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function base64(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** O plano guardado no banco; sem ele, os padrões. */
function parseStoredPlan(json: string | null): EditPlan {
  try {
    if (json) return JSON.parse(json) as EditPlan;
  } catch {
    // Plano ilegível: segue com os padrões.
  }
  return { pause: DEFAULT_PAUSE, camera: DEFAULT_CAMERA, parts: null };
}

export function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}
