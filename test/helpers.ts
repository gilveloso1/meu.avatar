import { env } from "cloudflare:workers";
import { handle } from "../src/index";
import type { AudioApi, ContainerPlan, Face } from "../src/audio";
import type { ExportApi } from "../src/exportar";
import { randomToken, sha256 } from "../src/auth";
import type { CloneStatus, HeyGenApi, HeyGenVideo, HeyGenVideoRequest, HeyGenVoice } from "../src/heygen";
import type { ChatRequest, ChatResult, VideoApi, VideoJob, VideoModel, VideoRequest } from "../src/openrouter";

export const SITE = "https://meu-avatar.gilveloso.workers.dev";

export const WAN: VideoModel = {
  id: "alibaba/wan-3.0",
  name: "Alibaba: Wan 3.0",
  supported_durations: Array.from({ length: 29 }, (_, i) => i + 2),
  supported_resolutions: ["480p", "720p", "1080p"],
  supported_aspect_ratios: ["16:9", "4:3", "1:1", "3:4", "9:16"],
  supported_frame_images: ["first_frame", "last_frame"],
  generate_audio: true,
  pricing_skus: { duration_seconds_480p: "0.05", duration_seconds_720p: "0.1", duration_seconds_1080p: "0.2" },
};

export const HEYGEN: VideoModel = {
  id: "heygen/avatar-iv",
  name: "HeyGen: Avatar IV",
  supported_durations: null,
  supported_resolutions: ["720p", "1080p"],
  supported_aspect_ratios: ["16:9", "9:16", "1:1"],
  supported_frame_images: null,
  generate_audio: false,
  pricing_skus: { duration_seconds: "0.05" },
};

export const SEEDANCE: VideoModel = {
  id: "bytedance/seedance-2.0",
  name: "ByteDance: Seedance 2.0",
  supported_durations: Array.from({ length: 12 }, (_, i) => i + 4),
  supported_resolutions: ["480p", "720p", "1080p"],
  supported_aspect_ratios: ["1:1", "3:4", "9:16", "4:3", "16:9"],
  supported_sizes: ["480x480", "480x640", "480x854", "640x480", "854x480", "720x720", "720x960", "720x1280", "960x720", "1280x720", "1080x1920", "1920x1080"],
  supported_frame_images: ["first_frame", "last_frame"],
  generate_audio: true,
  pricing_skus: { video_tokens: "0.000007", video_tokens_with_video_input: "0.0000043", video_tokens_1080p_with_video_input: "0.0000047" },
};

export const ALEPH_MODEL: VideoModel = {
  id: "runway/aleph-2",
  name: "Runway: Aleph 2.0",
  supported_durations: null,
  supported_resolutions: null,
  supported_aspect_ratios: ["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "21:9"],
  supported_frame_images: null,
  generate_audio: false,
  pricing_skus: { cents_per_second_output: "28", minimum_cents_per_generation: "56" },
};

const MODELS = [WAN, HEYGEN, SEEDANCE, ALEPH_MODEL];

/**
 * Um MP4 mínimo com a duração no cabeçalho (ftyp, mdat e moov > mvhd). A
 * versão 1 do mvhd usa campos de 64 bits; `moovFirst` põe o moov antes do mdat.
 */
export function fakeMp4(seconds: number, { version = 0, moovFirst = false, width = 0, height = 0 } = {}): Uint8Array<ArrayBuffer> {
  const timescale = 1000;
  const box = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    return out;
  };
  const mvhd = new Uint8Array(version === 1 ? 32 : 20);
  const view = new DataView(mvhd.buffer);
  view.setUint8(0, version);
  if (version === 1) {
    view.setUint32(20, timescale);
    view.setBigUint64(24, BigInt(Math.round(seconds * timescale)));
  } else {
    view.setUint32(12, timescale);
    view.setUint32(16, Math.round(seconds * timescale));
  }
  // Com tamanho: uma trilha de imagem com o tkhd (versão 0: largura e altura em 16.16 no byte 76).
  const tkhd = new Uint8Array(84);
  new DataView(tkhd.buffer).setUint32(76, width * 65536);
  new DataView(tkhd.buffer).setUint32(80, height * 65536);
  const mvhdBox = box("mvhd", mvhd);
  const trak = width ? box("trak", box("tkhd", tkhd)) : new Uint8Array(0);
  const moovBody = new Uint8Array(mvhdBox.length + trak.length);
  moovBody.set(mvhdBox, 0);
  moovBody.set(trak, mvhdBox.length);
  const moov = box("moov", moovBody);
  const parts = [box("ftyp", new TextEncoder().encode("isom")), ...(moovFirst ? [moov, box("mdat", new Uint8Array(16))] : [box("mdat", new Uint8Array(16)), moov])];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** OpenRouter de mentira: guarda os pedidos e responde o status que o teste mandar. */
export class FakeVideoApi implements VideoApi {
  submitted: VideoRequest[] = [];
  jobs = new Map<string, VideoJob>();
  downloads = 0;
  failSubmit: string | null = null;
  private next = 1;

  async getModel(id: string) {
    const model = MODELS.find((m) => m.id === id);
    if (!model) throw new Error(`modelo ${id} não existe`);
    return model;
  }
  async submit(body: VideoRequest) {
    if (this.failSubmit) throw new Error(this.failSubmit);
    this.submitted.push(body);
    const job: VideoJob = { id: `job-${this.next++}`, status: "pending" };
    this.jobs.set(job.id, job);
    return job;
  }
  async get(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("job não existe");
    return job;
  }
  async download(_job: VideoJob) {
    this.downloads++;
    return new TextEncoder().encode("mp4-falso").buffer as ArrayBuffer;
  }
  /** Pedidos de conversa (troca de rosto e conferência do fundo). */
  chats: ChatRequest[] = [];
  /** Quadros (pelo conteúdo, ex.: "quadro-2.5") cujo fundo a conferência sempre reprova. */
  rejectFrames: string[] = [];
  /** Quadros cujo cabelo a conferência sempre acha diferente do da referência. */
  rejectHair: string[] = [];
  /** Quantas trocas de rosto voltam sem imagem (as primeiras). */
  facesWithoutImage = 0;
  async chat(body: ChatRequest): Promise<ChatResult> {
    this.chats.push(body);
    const images = body.messages[0]!.content.flatMap((p) => (p.type === "image_url" ? [atob(p.image_url.url.split(",")[1]!)] : []));
    if (body.modalities?.includes("image")) {
      if (this.facesWithoutImage > 0) {
        this.facesWithoutImage--;
        return { text: "não consegui", images: [], cost: 0.04 };
      }
      return { text: "", images: [`data:image/jpeg;base64,${btoa(`${images[0]}+rosto`)}`], cost: 0.04 };
    }
    if (body.messages[0]!.content.some((p) => p.type === "text" && p.text.includes("cabelo_igual"))) {
      // Conferência do cabelo: a referência e o quadro trocado ("quadro-2.5+rosto-...").
      const igual = !this.rejectHair.some((q) => images[1]!.startsWith(`${q}+`));
      return { text: `{"cabelo_igual": ${igual}, "detalhes": ""}`, images: [], cost: 0.001 };
    }
    const fundo = this.rejectFrames.includes(images[0]!);
    return { text: `\`\`\`json\n{"fundo": ${fundo}, "objetos": false, "maos": false, "detalhes": ""}\n\`\`\``, images: [], cost: 0.001 };
  }
  finish(jobId: string, changes: Partial<VideoJob>) {
    this.jobs.set(jobId, { ...this.jobs.get(jobId)!, ...changes });
  }
}

export const ADMIN = { nome: "Gil", email: "gil@exemplo.com", senha: "senha-forte-123" };

/** Formulário enviado pelo próprio site (com o Origin do estúdio). */
export function postForm(path: string, fields: Record<string, string | File>, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}${path}`, { method: "POST", body: form(fields), headers: { origin: SITE, ...headers } });
}

/** Cookie de sessão do administrador: cria a conta na primeira vez, depois entra. */
export async function cookie(): Promise<string> {
  let res = await call(postForm("/cadastro", { ...ADMIN, confirmar: ADMIN.senha }));
  if (res.status !== 303) res = await call(postForm("/entrar", { email: ADMIN.email, senha: ADMIN.senha }));
  return sessionPair(res);
}

/** Cookie de sessão de uma conta comum (member), criada direto no banco. */
export async function memberCookie(): Promise<string> {
  const now = new Date().toISOString();
  const user = await env.DB.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, 'member', NULL, ?) RETURNING id")
    .bind("membro@exemplo.com", "Membro", now)
    .first<{ id: number }>();
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), user!.id, now, new Date(Date.now() + 86_400_000).toISOString())
    .run();
  return `__Host-sessao=${token}`;
}

/** "__Host-sessao=<código>" do Set-Cookie da resposta. */
export function sessionPair(res: Response): string {
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

/** Contêiner de exportação de mentira: guarda o que recebeu e devolve bytes conhecidos, ou falha. */
export class FakeExportApi implements ExportApi {
  segments: { sizes: number[]; plan: string }[] = [];
  joins: number[][] = [];
  fail: string | null = null;
  async segment(_job: string, body: ReadableStream, sizes: number[]) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    if (this.fail) throw new Error(this.fail);
    this.segments.push({ sizes, plan: new TextDecoder().decode(bytes.slice(0, sizes[0])) });
    return new Response(new TextEncoder().encode(`trecho${this.segments.length}`), { headers: { "content-length": "7" } });
  }
  async join(_job: string, body: ReadableStream, sizes: number[]) {
    await new Response(body).arrayBuffer();
    if (this.fail) throw new Error(this.fail);
    this.joins.push(sizes);
    return new Response(new TextEncoder().encode("mp4ok"), { headers: { "content-length": "5", "x-crc32": "123" } });
  }
}

/** Contêiner de áudio de mentira: devolve o MP4 com um sufixo, ou falha. */
export class FakeAudioApi implements AudioApi {
  calls = 0;
  edits = 0;
  plans: ContainerPlan[] = [];
  faces = 0;
  faceFound: Face = { x: 0.46, y: 0.44, altura: 0.25 };
  fail: string | null = null;
  async treat(mp4: ReadableStream, size: number) {
    this.calls++;
    return this.answer(mp4, size, "+tratado");
  }
  async edit(mp4: ReadableStream, size: number, plan: ContainerPlan) {
    this.edits++;
    this.plans.push(plan);
    return this.answer(mp4, size, "+editado");
  }
  async face(mp4: ArrayBuffer) {
    this.faces++;
    if (new TextDecoder().decode(mp4) !== "mp4-falso") throw new Error("o MP4 não chegou inteiro");
    if (this.fail) throw new Error(this.fail);
    return this.faceFound;
  }
  prepared = 0;
  /** O vídeo que o preparo devolve (um MP4 falso com duração e tamanho). */
  preparedMp4 = fakeMp4(5.5, { width: 1078, height: 1920 });
  frameTimes: number[][] = [];
  noFace = false;
  async prepare(mp4: ReadableStream, size: number) {
    this.prepared++;
    const original = new Uint8Array(await new Response(mp4).arrayBuffer());
    if (original.length !== size) throw new Error(`tamanho errado: ${original.length} != ${size}`);
    if (this.fail) throw new Error(this.fail);
    return new Response(this.preparedMp4, { headers: { "content-length": String(this.preparedMp4.length), "content-type": "video/mp4" } });
  }
  async frames(_mp4: ArrayBuffer, seconds: number[]) {
    this.frameTimes.push(seconds);
    return seconds.map((t) => btoa(`quadro-${t}`));
  }
  async faceCrop(_image: ArrayBuffer) {
    return this.noFace ? null : btoa("rosto");
  }
  async resize(image: string, width: number, height: number) {
    return btoa(`${atob(image)}-${width}x${height}`);
  }
  composed = 0;
  failCompose: string | null = null;
  /** Confere que o preparado e a saída do Aleph chegaram emendados e devolve "composto(<tamanho do preparado>)". */
  async compose(body: ReadableStream, size: number, firstSize: number) {
    this.composed++;
    const all = new Uint8Array(await new Response(body).arrayBuffer());
    if (all.length !== size) throw new Error(`tamanho errado: ${all.length} != ${size}`);
    if (this.failCompose) throw new Error(this.failCompose);
    const second = new TextDecoder().decode(all.subarray(firstSize));
    const out = new TextEncoder().encode(`composto(${firstSize}, ${second})`);
    return new Response(out, { headers: { "content-length": String(out.length), "content-type": "video/mp4" } });
  }
  private async answer(mp4: ReadableStream, size: number, suffix: string) {
    const original = new Uint8Array(await new Response(mp4).arrayBuffer());
    if (original.length !== size) throw new Error(`tamanho errado: ${original.length} != ${size}`);
    if (this.fail) throw new Error(this.fail);
    const out = new TextEncoder().encode(new TextDecoder().decode(original) + suffix);
    return new Response(out, { headers: { "content-length": String(out.length), "content-type": "video/mp4" } });
  }
}

/** HeyGen de mentira (API direta): guarda os arquivos e os pedidos e responde o que o teste mandar. */
export class FakeHeyGenApi implements HeyGenApi {
  assets: { id: string; type: string; name: string; text: string }[] = [];
  videos: HeyGenVideoRequest[] = [];
  details = new Map<string, HeyGenVideo>();
  clones: { name: string; assetId: string }[] = [];
  cloneStatuses = new Map<string, CloneStatus>();
  speeches: { voiceId: string; text: string }[] = [];
  catalog: HeyGenVoice[] = [
    { voice_id: "voz-ana", name: "Ana", language: "Portuguese", gender: "female", support_locale: true },
    { voice_id: "voz-rui", name: "Rui", language: "Portuguese", gender: "male", support_locale: false },
  ];
  failVideo: string | null = null;
  downloads: string[] = [];
  private next = 1;

  async uploadAsset(bytes: ArrayBuffer, type: string, name: string) {
    const id = `asset-${this.next++}`;
    this.assets.push({ id, type, name, text: new TextDecoder().decode(bytes) });
    return id;
  }
  async createVideo(body: HeyGenVideoRequest) {
    if (this.failVideo) throw new Error(this.failVideo);
    this.videos.push(body);
    const video_id = `hg-${this.next++}`;
    this.details.set(video_id, { id: video_id, status: "pending" });
    return { video_id };
  }
  async getVideo(id: string) {
    const detail = this.details.get(id);
    if (!detail) throw new Error("vídeo não existe");
    return detail;
  }
  async download(url: string) {
    this.downloads.push(url);
    return new TextEncoder().encode("mp4-heygen").buffer as ArrayBuffer;
  }
  async voices() {
    return this.catalog;
  }
  async cloneVoice(name: string, assetId: string) {
    this.clones.push({ name, assetId });
    const id = `clone-${this.next++}`;
    this.cloneStatuses.set(id, { status: "PENDING" });
    return id;
  }
  async cloneStatus(voiceId: string) {
    return this.cloneStatuses.get(voiceId) ?? { status: "FAILED" as const, failure_reason: "INVALID_AUDIO" };
  }
  async speech(voiceId: string, text: string) {
    this.speeches.push({ voiceId, text });
    return `https://files.heygen.ai/audio/${voiceId}.wav`;
  }
  deletedVideos: string[] = [];
  deletedAssets: string[] = [];
  failDelete = false;
  async deleteVideo(id: string) {
    if (this.failDelete) throw new Error("HeyGen fora do ar");
    this.deletedVideos.push(id);
  }
  async deleteAsset(id: string) {
    if (this.failDelete) throw new Error("HeyGen fora do ar");
    this.deletedAssets.push(id);
  }
  finish(videoId: string, changes: Partial<HeyGenVideo>) {
    this.details.set(videoId, { ...this.details.get(videoId)!, ...changes });
  }
}

export function call(request: Request, api: VideoApi | null = new FakeVideoApi(), audio: AudioApi | null = null, heygen: HeyGenApi | null = null, exporter: ExportApi | null = null): Promise<Response> {
  return handle(request, { ...env, SITE_URL: SITE }, { api, audio, heygen, exporter });
}

export function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

export async function sign(body: string, secret = "segredo-webhook", t = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t},${body}`)));
  return `t=${t},v1=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
