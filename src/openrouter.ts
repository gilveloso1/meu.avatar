// Cliente da API de vídeo do OpenRouter (assíncrona: envia, consulta, baixa).
// Docs: https://openrouter.ai/docs/guides/overview/multimodal/video-generation.md
// Só usa fetch e WebCrypto: roda no Worker e no Node (tools/gerar-video.ts).

export const OPENROUTER_API = "https://openrouter.ai/api/v1";

export type FrameType = "first_frame" | "last_frame";

export interface VideoModel {
  id: string;
  name: string;
  supported_durations: number[] | null;
  supported_resolutions: string[] | null;
  supported_aspect_ratios: string[] | null;
  /** Tamanhos exatos ("1280x720"), quando o modelo lista; o Seedance cobra pelos pixels. */
  supported_sizes?: string[] | null;
  supported_frame_images: FrameType[] | null;
  generate_audio: boolean | null;
  pricing_skus: Record<string, string> | null;
}

export interface VideoRequest {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  generate_audio?: boolean;
  seed?: number;
  callback_url?: string;
  frame_images?: { type: "image_url"; image_url: { url: string }; frame_type: FrameType }[];
  /**
   * Referências: imagens (o HeyGen Avatar IV recebe a foto assim) e, só no
   * Seedance 2 em diante, vídeos e áudios.
   */
  input_references?: InputReference[];
  /** Opções do provedor, por slug (só as de allowed_passthrough_parameters). */
  provider?: { options: Record<string, Record<string, string>> };
}

export type InputReference =
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "audio_url"; audio_url: { url: string } };

export type JobStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";

export interface VideoJob {
  id: string;
  status: JobStatus;
  polling_url?: string;
  generation_id?: string;
  unsigned_urls?: string[];
  usage?: { cost?: number; is_byok?: boolean };
  error?: string;
}

/** O que o resto do projeto usa da API; os testes trocam por um falso. */
export interface VideoApi {
  getModel(id: string): Promise<VideoModel>;
  submit(body: VideoRequest): Promise<VideoJob>;
  get(jobId: string): Promise<VideoJob>;
  download(job: VideoJob): Promise<ArrayBuffer>;
}

export class OpenRouterVideo implements VideoApi {
  private models?: Promise<VideoModel[]>;

  constructor(
    private readonly apiKey: string,
    private readonly base = OPENROUTER_API,
  ) {}

  /** Lista pública dos modelos de vídeo (não precisa de chave). */
  static async listModels(base = OPENROUTER_API): Promise<VideoModel[]> {
    const res = await fetch(`${base}/videos/models`);
    if (!res.ok) throw new Error(`Falha ao listar modelos: HTTP ${res.status} ${await res.text()}`);
    return ((await res.json()) as { data: VideoModel[] }).data;
  }

  async getModel(id: string): Promise<VideoModel> {
    // Uma consulta à lista por instância (uma por pedido no Worker), mesmo com vários modelos na página.
    this.models ??= OpenRouterVideo.listModels(this.base);
    const model = (await this.models).find((m) => m.id === id);
    if (!model) throw new Error(`Modelo ${id} não encontrado em ${this.base}/videos/models`);
    return model;
  }

  async submit(body: VideoRequest): Promise<VideoJob> {
    return (await this.request(`${this.base}/videos`, { method: "POST", body: JSON.stringify(body) })).json();
  }

  async get(jobId: string): Promise<VideoJob> {
    return (await this.request(`${this.base}/videos/${encodeURIComponent(jobId)}`)).json();
  }

  async download(job: VideoJob, index = 0): Promise<ArrayBuffer> {
    const url = job.unsigned_urls?.[index] ?? `${this.base}/videos/${encodeURIComponent(job.id)}/content?index=${index}`;
    return (await this.request(url)).arrayBuffer();
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`OpenRouter respondeu HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return res;
  }
}

/** Confere duração, resolução, formato e quadros contra o que o modelo aceita. */
export function validate(model: VideoModel, req: VideoRequest): string[] {
  const errors: string[] = [];
  const check = (label: string, value: string | number | undefined, allowed: (string | number)[] | null) => {
    if (value !== undefined && allowed && !allowed.includes(value)) errors.push(`${label} ${value} (aceitos: ${allowed.join(", ")})`);
  };
  check("duração", req.duration, model.supported_durations);
  check("resolução", req.resolution, model.supported_resolutions);
  check("formato", req.aspect_ratio, model.supported_aspect_ratios);
  for (const frame of req.frame_images ?? []) check("quadro", frame.frame_type, model.supported_frame_images);
  return errors;
}

/** Custo estimado em US$, pelo preço por segundo da resolução. */
export function estimateCost(model: VideoModel, req: VideoRequest): number | undefined {
  const price = model.pricing_skus?.[`duration_seconds_${req.resolution}`];
  return price && req.duration ? Number(price) * req.duration : undefined;
}

const FIVE_MINUTES = 300;

/**
 * Confere o cabeçalho X-OpenRouter-Signature (t=...,v1=...): HMAC-SHA256 de
 * "{t},{corpo}" com o segredo de assinatura do workspace, recusando avisos
 * com mais de 5 minutos.
 */
export async function verifySignature(rawBody: string, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const age = Math.floor(now / 1000) - Number(t);
  if (!Number.isFinite(age) || Math.abs(age) > FIVE_MINUTES) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t},${rawBody}`)));
  return safeEqual([...mac].map((b) => b.toString(16).padStart(2, "0")).join(""), v1);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
