import type { AudioApi, Face } from "./audio";
import { Db, OPEN_STATUSES, type Role, type Video, type Voice } from "./db";
import { ERROS } from "./erros";
import { mp4Duration, mp4Size } from "./mp4";
import { type InputReference, validate, type VideoApi, type VideoJob, type VideoModel, type VideoRequest } from "./openrouter";
import { containerPlan, DEFAULT_CAMERA, DEFAULT_PAUSE, type EditPlan, storedFace } from "./quickedit";
import type { HeyGenApi, HeyGenVideoRequest, HeyGenVoice } from "./heygen";
import { canUse, InputError, type Lists, onPlatform, structureById, type Structure, type Values, videoPlatform } from "./structures";
import { HEYGEN_AVATAR } from "./structures/heygen";
import { HEYGEN_MODEL, NEW_CLONE, PRICE_PER_SECOND, voiceOptions } from "./structures/heygen-direta";
import {
  aspectLabel,
  chainPrompt,
  CHECK_MODEL,
  CHECK_PROMPT,
  FACE_MODEL,
  FACE_TRIES,
  facePrompt,
  HAIR_PROMPT,
  keyframeTimes,
  MAX_PREPARED_BYTES,
  parseCheck,
  parseHair,
} from "./structures/aleph";

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
  /** Áudio da fala ("Meu áudio", HeyGen pela API direta). */
  audio?: File | null;
  /** Gravação para clonar uma voz nova (HeyGen pela API direta). */
  sample?: File | null;
  /** O avatar de onde veio a foto (null com arquivo solto). */
  avatarId?: string | null;
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

const AUDIO_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav" };
/** Limite do áudio enviado: o do upload de arquivos da HeyGen. */
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
/** Depois disso, a voz clonada que não ficou pronta conta como falha. */
export const VOICE_TIMEOUT_MS = 30 * 60_000;
/** As vozes prontas da HeyGen mudam pouco: ficam guardadas por uma hora em cada instância. */
const VOICES_TTL_MS = 60 * 60_000;
let voicesCache: { at: number; voices: HeyGenVoice[] } | null = null;

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
    /** API direta da HeyGen (HEYGEN_API_KEY); sem ela, o HeyGen segue pelo OpenRouter. */
    private readonly heygen: HeyGenApi | null = null,
  ) {}

  get canGenerate(): boolean {
    return this.api !== null;
  }

  /** Dá para gerar com esta estrutura (a chave da plataforma dela existe)? */
  canGenerateWith(structure: Structure): boolean {
    return structure.platform === "heygen" ? this.heygen !== null : this.api !== null;
  }

  /**
   * A estrutura na plataforma que a config do banco escolhe ('plataforma.heygen').
   * Se ela manda a HeyGen direta e falta a chave, segue pelo OpenRouter (e registra no log).
   */
  async resolve(structure: Structure): Promise<Structure> {
    if (structure.id !== HEYGEN_AVATAR.id) return structure;
    const platform = await this.db.platform();
    if (platform === "heygen" && !this.heygen) {
      console.error("A config manda o HeyGen pela API direta, mas falta a HEYGEN_API_KEY: segue pelo OpenRouter.");
      return structure;
    }
    return onPlatform(structure, platform);
  }

  /** As listas do formulário da HeyGen direta: as vozes prontas e as vozes clonadas da pessoa. */
  async lists(structure: Structure, userId: number): Promise<Lists> {
    if (structure.platform !== "heygen" || !this.heygen) return {};
    if (!voicesCache || Date.now() - voicesCache.at > VOICES_TTL_MS) {
      try {
        voicesCache = { at: Date.now(), voices: await this.heygen.voices() };
      } catch (err) {
        // Sem o catálogo, o formulário usa as vozes que o OpenRouter mostra (também são da HeyGen).
        console.error("Não deu para listar as vozes da HeyGen", err);
      }
    }
    const clones = (await this.db.voicesByUser(userId)).map((v) => ({ value: v.id, label: v.status === "ACTIVE" ? v.name : `${v.name} (preparando)` }));
    return { voices: voiceOptions(voicesCache?.voices ?? []), clones };
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
    if (structure.platform === "heygen") return this.createDirect(input);
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
      avatar_id: input.avatarId ?? null,
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
    if (videoPlatform(video) === "heygen") return this.syncDirect(video);
    // Já voltou do Aleph e espera a composição (prepareNext): nada a consultar.
    if (video.prep_status === "compose" || video.prep_status === "composing") return video;
    if (!this.api) return video;
    const api = this.api;
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
    const structure = structureById(video.structure);
    if (job.status === "completed" && structure?.compose && this.audio) {
      // A saída do Aleph fica guardada; o vídeo aparece depois da composição.
      const raw = `videos/${video.id}.aleph.mp4`;
      await this.media.put(raw, await api.download(job), { httpMetadata: { contentType: "video/mp4" } });
      const settings = JSON.stringify({ ...parseSettings(video.settings), aleph_key: raw });
      return (await this.db.updateVideo(video.id, { status: "in_progress", prep_status: "compose", cost, settings }))!;
    }
    if (job.status === "completed") {
      const key = `videos/${video.id}.mp4`;
      await this.media.put(key, await api.download(job), { httpMetadata: { contentType: "video/mp4" } });
      return (await this.db.updateVideo(video.id, {
        status: "completed",
        video_key: key,
        cost,
        // O áudio entra na fila do contêiner, se a estrutura pede; o agendamento trata um por vez.
        audio_status: this.audio && (structure?.treatAudio ?? true) ? "pending" : null,
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
    const before = new Date(now.getTime() - AUDIO_TIMEOUT_MS).toISOString();
    await this.db.failStalePrep(before, now.toISOString());
    // Composição que não terminou: fica a saída pura do Aleph.
    for (const stale of await this.db.staleCompositions(before)) await this.finishWithoutComposition(stale, "A composição demorou demais.");
    // Primeiro a composição de um vídeo que já voltou do Aleph (falta pouco para ficar pronto).
    const ready = await this.db.claimCompose(now.toISOString());
    if (ready) {
      try {
        return await this.compose(ready, this.audio);
      } catch (err) {
        console.error("Falha na composição", ready.id, err);
        return this.finishWithoutComposition(ready, errorMessage(err));
      }
    }
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

    // 3. O rosto trocado nos quadros, em cadeia: o primeiro sai da foto e vira a referência de rosto e
    //    cabelo dos outros. Cada um é conferido (fundo igual ao original; cabelo igual ao da referência)
    //    e o reprovado é refeito uma vez.
    let prepCost = 0;
    const image = (url: string) => ({ type: "image_url" as const, image_url: { url } });
    const jpeg = (b64: string) => `data:image/jpeg;base64,${b64}`;
    const swap = async (text: string, images: string[], at: number): Promise<string | null> => {
      const edit = await api.chat({ model: FACE_MODEL, modalities: ["image", "text"], messages: [{ role: "user", content: [{ type: "text", text }, ...images.map(image)] }] });
      prepCost += edit.cost;
      const edited = edit.images[0]?.replace(/^data:[^,]*,/, "");
      if (!edited) {
        console.error("Troca do rosto sem imagem", video.id, at, edit.text.slice(0, 300));
        return null;
      }
      return audio.resize(edited, size.width, size.height);
    };
    const ask = async (text: string, a: string, b: string): Promise<string> => {
      const answer = await api.chat({ model: CHECK_MODEL, temperature: 0, messages: [{ role: "user", content: [{ type: "text", text }, image(jpeg(a)), image(jpeg(b))] }] });
      prepCost += answer.cost;
      return answer.text;
    };
    const cropUrl = crop ? jpeg(crop) : null;
    // A referência: o primeiro quadro (na ordem do vídeo) que, trocado a partir da foto, mantém o fundo.
    let reference: { index: number; image: string } | null = null;
    for (let i = 0; i < frames.length && !reference; i++) {
      for (let attempt = 1; attempt <= FACE_TRIES && !reference; attempt++) {
        const swapped = await swap(facePrompt(crop !== null), [jpeg(frames[i]!), photoUrl, ...(cropUrl ? [cropUrl] : [])], times[i]!);
        if (!swapped) continue;
        const check = await ask(CHECK_PROMPT, frames[i]!, swapped);
        const verdict = parseCheck(check);
        if (verdict && !verdict.fundo) reference = { index: i, image: swapped };
        else console.error("Quadro-chave reprovado na conferência do fundo", video.id, times[i], attempt, check.slice(0, 300));
      }
    }
    if (!reference) throw new Error("Nenhum quadro-chave passou na conferência do fundo.");
    const ref = reference;
    const chained = async (frame: string, at: number): Promise<{ at: number; image: string } | null> => {
      for (let attempt = 1; attempt <= FACE_TRIES; attempt++) {
        const swapped = await swap(chainPrompt(crop !== null), [jpeg(frame), jpeg(ref.image), ...(cropUrl ? [cropUrl] : [])], at);
        if (!swapped) continue;
        const [background, hair] = await Promise.all([ask(CHECK_PROMPT, frame, swapped), ask(HAIR_PROMPT, ref.image, swapped)]);
        const verdict = parseCheck(background);
        if (verdict && !verdict.fundo && parseHair(hair) === true) return { at, image: swapped };
        console.error("Quadro-chave reprovado na conferência", video.id, at, attempt, background.slice(0, 200), hair.slice(0, 200));
      }
      return null;
    };
    const rest = await Promise.all(frames.slice(ref.index + 1).map((frame, i) => chained(frame, times[ref.index + 1 + i]!)));
    const accepted = [{ at: times[ref.index]!, image: ref.image }, ...rest.filter((k): k is { at: number; image: string } => k !== null)];

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

  /** Compõe o vídeo preparado com a saída do Aleph (container/aleph.py) e o vídeo fica pronto. */
  private async compose(video: Video, audio: AudioApi): Promise<Video> {
    const settings = parseSettings(video.settings);
    const prepared = settings.prepared_key ? await this.media.get(settings.prepared_key) : null;
    const raw = settings.aleph_key ? await this.media.get(settings.aleph_key) : null;
    if (!prepared || !raw) throw new Error("O vídeo preparado ou a saída do Aleph não estão no R2.");
    // Os dois emendados num corpo só, sem carregar na memória do Worker.
    const { readable, writable } = new FixedLengthStream(prepared.size + raw.size);
    const piping = prepared.body.pipeTo(writable, { preventClose: true }).then(() => raw.body.pipeTo(writable));
    // Se o contêiner falhar, o erro que vale é o dele (o da emenda vem junto e é ignorado).
    piping.catch(() => {});
    const res = await audio.compose(readable, prepared.size + raw.size, prepared.size);
    await piping;
    const key = `videos/${video.id}.mp4`;
    const out = new FixedLengthStream(Number(res.headers.get("content-length")));
    await Promise.all([res.body!.pipeTo(out.writable), this.media.put(key, out.readable, { httpMetadata: { contentType: "video/mp4" } })]);
    return (await this.db.updateVideo(video.id, { status: "completed", video_key: key, prep_status: "done", prep_error: null }))!;
  }

  /** Sem composição, o vídeo fica pronto com a saída pura do Aleph; o motivo fica no banco e no log. */
  private async finishWithoutComposition(video: Video, reason: string): Promise<Video> {
    const raw = parseSettings(video.settings).aleph_key ?? null;
    return (await this.db.updateVideo(video.id, { status: raw ? "completed" : "failed", video_key: raw, prep_status: "failed", prep_error: reason, error: raw ? null : reason }))!;
  }

  /**
   * HeyGen pela API direta: sobe a foto (e o áudio) para a HeyGen e pede o
   * vídeo. Com voz clonada, a fala vira áudio antes (texto para fala); se a voz
   * ainda está sendo clonada, o vídeo espera na fila (voiceNext).
   */
  private async createDirect(input: NewVideoInput): Promise<Video> {
    const { structure } = input;
    const heygen = this.heygen;
    if (!heygen) throw new InputError(ERROS.criacaoPausada);

    const image = input.image && input.image.size > 0 ? input.image : null;
    const ext = image ? IMAGE_TYPES[image.type] : undefined;
    if (image && !ext) throw new InputError(ERROS.fotoTipo);
    if (image && image.size > MAX_IMAGE_BYTES) throw new InputError(ERROS.fotoTamanho);

    const lists = await this.lists(structure, input.user.id);
    const built = structure.build(input.values, image !== null, HEYGEN_MODEL, null, lists);
    const plan = built.heygen!;
    const audio = plan.source === "audio" ? checkAudio(input.audio, ERROS.audioFala) : null;
    const sample = plan.clone === NEW_CLONE ? checkAudio(input.sample, ERROS.amostraVoz) : null;
    let voice: Voice | null = null;
    if (plan.clone && plan.clone !== NEW_CLONE) {
      voice = await this.db.voiceById(plan.clone);
      if (!voice || voice.user_id !== input.user.id || voice.status === "FAILED") throw new InputError(ERROS.vozClonada);
    }

    const id = crypto.randomUUID();
    const imageBytes = await image!.arrayBuffer();
    const imageKey = `avatares/${crypto.randomUUID()}.${ext}`;
    await this.media.put(imageKey, imageBytes, { httpMetadata: { contentType: image!.type } });
    const audioBytes = audio ? await audio.file.arrayBuffer() : null;
    const audioKey = audio ? `audios/${crypto.randomUUID()}.${audio.ext}` : null;
    if (audio && audioKey) await this.media.put(audioKey, audioBytes!, { httpMetadata: { contentType: audio.file.type } });

    const { settings, ...record } = built.record;
    const video = await this.db.insertVideo({
      id,
      ...record,
      model: structure.model,
      image_key: imageKey,
      user_id: input.user.id,
      structure: structure.id,
      avatar_id: input.avatarId ?? null,
      settings: JSON.stringify({ ...settings, ...(audioKey ? { audio_key: audioKey } : {}) }),
    });

    try {
      // Os arquivos enviados ficam anotados no vídeo, para serem apagados na HeyGen depois (cleanUpHeyGen).
      const assets: string[] = [];
      const upload = async (bytes: ArrayBuffer, type: string, name: string) => {
        const assetId = await heygen.uploadAsset(bytes, type, name);
        assets.push(assetId);
        await this.db.updateVideo(id, { settings: JSON.stringify({ ...parseSettings(video.settings), heygen_assets: assets.join(",") }) });
        return assetId;
      };
      const body: HeyGenVideoRequest = {
        type: "image",
        image: { type: "asset_id", asset_id: await upload(imageBytes, image!.type, `avatar.${ext}`) },
        resolution: plan.resolution,
        aspect_ratio: plan.aspectRatio,
        expressiveness: plan.expressiveness,
        motion_prompt: plan.motionPrompt,
        callback_id: id,
      };
      if (this.config.siteUrl.startsWith("https://")) body.callback_url = `${this.config.siteUrl}/heygen/webhook`;
      if (plan.source === "pronta") {
        body.script = plan.script!;
        body.voice_id = plan.voiceId!;
        if (plan.locale) body.voice_settings = { locale: plan.locale };
      }
      if (audio) body.audio_asset_id = await upload(audioBytes!, audio.file.type, `fala.${audio.ext}`);
      if (plan.source === "clonada") {
        if (sample) {
          const assetId = await upload(await sample.file.arrayBuffer(), sample.file.type, `voz.${sample.ext}`);
          const providerId = await heygen.cloneVoice(plan.cloneName!, assetId);
          voice = await this.db.insertVoice({ id: crypto.randomUUID(), user_id: input.user.id, name: plan.cloneName!, provider_voice_id: providerId, status: "PENDING" });
        }
        const waiting = JSON.stringify({ ...parseSettings(video.settings), heygen_assets: assets.join(","), voice_row: voice!.id, voice: voice!.name, heygen_request: JSON.stringify(body) });
        if (voice!.status !== "ACTIVE") return (await this.db.updateVideo(id, { prep_status: "voz", settings: waiting }))!;
        await this.db.updateVideo(id, { settings: waiting });
        body.audio_url = await heygen.speech(voice!.provider_voice_id, plan.script!);
      }
      const { video_id } = await heygen.createVideo(body);
      return (await this.db.updateVideo(id, { job_id: video_id, status: "pending" }))!;
    } catch (err) {
      console.error("Falha ao pedir o vídeo à HeyGen", id, err);
      const failed = (await this.db.updateVideo(id, { status: "failed", error: errorMessage(err) }))!;
      return this.cleanUpHeyGen(failed);
    }
  }

  /**
   * Agendamento: os vídeos que esperam a voz clonada. Quando a voz fica pronta,
   * a fala vira áudio e o vídeo é pedido; se a clonagem falha (ou demora
   * demais), o vídeo falha.
   */
  async voiceNext(now = new Date()): Promise<Video[]> {
    const heygen = this.heygen;
    if (!heygen) return [];
    const done: Video[] = [];
    for (const video of await this.db.waitingVoice()) {
      const settings = parseSettings(video.settings);
      try {
        const voice = settings.voice_row ? await this.db.voiceById(settings.voice_row) : null;
        if (!voice) throw new Error("A voz clonada do vídeo não existe mais.");
        let status = voice.status;
        if (status === "PENDING") {
          const answer = await heygen.cloneStatus(voice.provider_voice_id);
          status = answer.status;
          if (status !== "PENDING") await this.db.updateVoice(voice.id, status, answer.failure_reason ?? null);
        }
        if (status === "FAILED") throw new Error(`A HeyGen não clonou a voz (${voice.name}).`);
        if (status === "PENDING") {
          if (now.getTime() - Date.parse(video.created_at) > VOICE_TIMEOUT_MS) throw new Error("A voz clonada demorou demais.");
          continue;
        }
        const body = JSON.parse(settings.heygen_request ?? "{}") as HeyGenVideoRequest;
        body.audio_url = await heygen.speech(voice.provider_voice_id, video.request_prompt ?? video.prompt);
        const { video_id } = await heygen.createVideo(body);
        done.push((await this.db.updateVideo(video.id, { job_id: video_id, status: "pending", prep_status: "done" }))!);
      } catch (err) {
        console.error("Falha na voz clonada", video.id, err);
        const failed = (await this.db.updateVideo(video.id, { status: "failed", prep_status: "failed", prep_error: errorMessage(err), error: errorMessage(err) }))!;
        done.push(await this.cleanUpHeyGen(failed));
      }
    }
    return done;
  }

  /** Confere o vídeo na HeyGen e, se terminou, guarda o MP4 no R2; o custo sai da duração. */
  private async syncDirect(video: Video): Promise<Video> {
    if (!this.heygen) return video;
    let detail;
    try {
      detail = await this.heygen.getVideo(video.job_id!);
    } catch (err) {
      console.error("Falha ao consultar o vídeo na HeyGen", video.job_id, err);
      return video;
    }
    if (detail.status === "completed" && detail.video_url) {
      const key = `videos/${video.id}.mp4`;
      await this.media.put(key, await this.heygen.download(detail.video_url), { httpMetadata: { contentType: "video/mp4" } });
      const seconds = detail.duration ?? video.duration;
      const saved = (await this.db.updateVideo(video.id, {
        status: "completed",
        video_key: key,
        duration: Math.max(1, Math.round(seconds)),
        cost: Math.round(seconds * PRICE_PER_SECOND * 10_000) / 10_000,
        // A voz vem pronta da HeyGen (ou é o áudio da pessoa): não passa pelo contêiner.
        audio_status: null,
      }))!;
      return this.cleanUpHeyGen(saved);
    }
    if (detail.status === "failed") {
      const reason = [detail.failure_code, detail.failure_message].filter(Boolean).join(": ") || "A HeyGen não gerou o vídeo.";
      return this.cleanUpHeyGen((await this.db.updateVideo(video.id, { status: "failed", error: reason }))!);
    }
    const status = detail.status === "processing" ? "in_progress" : "pending";
    return status !== video.status ? (await this.db.updateVideo(video.id, { status }))! : video;
  }

  /**
   * Apaga na HeyGen o vídeo e os arquivos enviados (foto, áudio, gravação da voz) depois que o vídeo
   * está no R2 ou falhou: a página do vídeo lá abre sem login, e a HeyGen pode usar o que fica guardado.
   * O que não deu para apagar fica anotado (heygen_assets) e vai para o log; o vídeo segue normal.
   */
  private async cleanUpHeyGen(video: Video): Promise<Video> {
    const heygen = this.heygen;
    if (!heygen) return video;
    const settings = parseSettings(video.settings);
    const left: string[] = [];
    const remove = async (what: string, run: () => Promise<void>) => {
      try {
        await run();
      } catch (err) {
        console.error("Não deu para apagar na HeyGen", video.id, what, err);
        left.push(what);
      }
    };
    if (video.job_id && settings.heygen_video_deleted !== "sim") {
      await remove(`video:${video.job_id}`, () => heygen.deleteVideo(video.job_id!));
    }
    for (const assetId of (settings.heygen_assets ?? "").split(",").filter(Boolean)) await remove(assetId, () => heygen.deleteAsset(assetId));
    const assets = left.filter((w) => !w.startsWith("video:"));
    const next = { ...settings, heygen_assets: assets.join(","), ...(video.job_id && !left.includes(`video:${video.job_id}`) ? { heygen_video_deleted: "sim" } : {}) };
    if (!next.heygen_assets) delete (next as Record<string, string>).heygen_assets;
    return (await this.db.updateVideo(video.id, { settings: JSON.stringify(next) }))!;
  }

  /** Aviso da HeyGen de que um vídeo terminou: acha pelo callback_id (o id do vídeo) ou pelo id da HeyGen e confere. */
  async onHeyGenWebhook(payload: unknown): Promise<Video | null> {
    const body = (payload ?? {}) as { callback_id?: unknown; video_id?: unknown; event_data?: { callback_id?: unknown; video_id?: unknown } };
    const callbackId = body.event_data?.callback_id ?? body.callback_id;
    const videoId = body.event_data?.video_id ?? body.video_id;
    const video =
      (typeof callbackId === "string" ? await this.db.videoById(callbackId) : null) ?? (typeof videoId === "string" ? await this.db.videoByJob(videoId) : null);
    return video ? this.sync(video) : null;
  }

  /** Agendamento: confere os vídeos ainda abertos. */
  async syncOpen(limit = 10): Promise<Video[]> {
    if (!this.api && !this.heygen) return [];
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

/** Confere o áudio enviado (tipo e tamanho); sem arquivo, o erro do campo. */
function checkAudio(file: File | null | undefined, missing: string): { file: File; ext: string } {
  if (!file || file.size === 0) throw new InputError(missing);
  const ext = AUDIO_TYPES[file.type];
  if (!ext) throw new InputError(ERROS.audioTipo);
  if (file.size > MAX_AUDIO_BYTES) throw new InputError(ERROS.audioTamanho(MAX_AUDIO_BYTES / 1024 / 1024));
  return { file, ext };
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
