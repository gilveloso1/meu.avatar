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
  provider?: { options: Record<string, Record<string, unknown>> };
}

export type InputReference =
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "audio_url"; audio_url: { url: string } };

/** Pedido à API de imagens (POST /images): a resposta já traz a imagem. */
export interface ImageRequest {
  model: string;
  prompt: string;
  resolution?: string;
  aspect_ratio?: string;
  /** Fotos de referência (o rosto, a cena); sem elas, a imagem sai só do texto. */
  input_references?: InputReference[];
}

export interface ImageResult {
  bytes: ArrayBuffer;
  type: string;
  /** Custo em US$, como o OpenRouter informa. */
  cost: number;
}

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

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** Uma conversa com imagens (chat completions): trocar o rosto num quadro ou conferir o fundo. */
export interface ChatRequest {
  model: string;
  messages: { role: "user"; content: ChatPart[] }[];
  /** ["image", "text"] para o modelo devolver imagem. */
  modalities?: ("image" | "text")[];
  temperature?: number;
}

export interface ChatResult {
  text: string;
  /** Imagens devolvidas, em data URL. */
  images: string[];
  /** Custo em US$, como o OpenRouter informa. */
  cost: number;
}

/** O que o resto do projeto usa da API; os testes trocam por um falso. */
export interface VideoApi {
  getModel(id: string): Promise<VideoModel>;
  submit(body: VideoRequest): Promise<VideoJob>;
  get(jobId: string): Promise<VideoJob>;
  download(job: VideoJob): Promise<ArrayBuffer>;
  chat(body: ChatRequest): Promise<ChatResult>;
  /** Um modelo de imagem, no formato dos de vídeo (resoluções, formatos e preços). */
  getImageModel(id: string): Promise<VideoModel>;
  image(body: ImageRequest): Promise<ImageResult>;
}

export class OpenRouterVideo implements VideoApi {
  private models?: Promise<VideoModel[]>;
  private imageModels?: Promise<VideoModel[]>;

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

  /**
   * Lista pública dos modelos de imagem (GET /images/models), no formato dos de vídeo: as
   * resoluções e os formatos vêm de `supported_parameters`; sem duração nem quadros. O preço
   * fica em cada modelo (`getImageModel`).
   */
  static async listImageModels(base = OPENROUTER_API): Promise<VideoModel[]> {
    const res = await fetch(`${base}/images/models`);
    if (!res.ok) throw new Error(`Falha ao listar modelos de imagem: HTTP ${res.status} ${await res.text()}`);
    return ((await res.json()) as { data: ImageModelInfo[] }).data.map((m) => ({
      id: m.id,
      name: m.name,
      supported_durations: null,
      supported_resolutions: m.supported_parameters?.resolution?.values ?? null,
      supported_aspect_ratios: m.supported_parameters?.aspect_ratio?.values ?? null,
      supported_frame_images: null,
      generate_audio: null,
      pricing_skus: null,
    }));
  }

  /**
   * O modelo de imagem com os preços do primeiro provedor (GET /images/models/<id>/endpoints),
   * um SKU por item: "<billable>_<unit>[_<variant>]", como "output_image_token".
   */
  async getImageModel(id: string): Promise<VideoModel> {
    this.imageModels ??= OpenRouterVideo.listImageModels(this.base);
    const model = (await this.imageModels).find((m) => m.id === id);
    if (!model) throw new Error(`Modelo ${id} não encontrado em ${this.base}/images/models`);
    const res = await fetch(`${this.base}/images/models/${id}/endpoints`);
    if (!res.ok) throw new Error(`Falha ao ler os preços de ${id}: HTTP ${res.status}`);
    const pricing = ((await res.json()) as { endpoints?: { pricing?: { billable: string; unit: string; cost_usd: number; variant?: string }[] }[] }).endpoints?.[0]?.pricing ?? [];
    const skus: Record<string, string> = {};
    for (const p of pricing) skus[`${p.billable}_${p.unit}${p.variant ? `_${p.variant}` : ""}`] = String(p.cost_usd);
    return { ...model, pricing_skus: skus };
  }

  async image(body: ImageRequest): Promise<ImageResult> {
    const data = (await (await this.request(`${this.base}/images`, { method: "POST", body: JSON.stringify(body) })).json()) as {
      data?: { b64_json?: string; url?: string }[];
      usage?: { cost?: number };
    };
    const item = data.data?.[0];
    const url = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!url) throw new Error("O modelo de imagem não devolveu imagem.");
    let bytes: ArrayBuffer, type: string;
    if (url.startsWith("data:")) {
      type = /^data:([^;,]+)/.exec(url)?.[1] ?? "image/png";
      bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0)).buffer;
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Falha ao baixar a imagem: HTTP ${res.status}`);
      type = res.headers.get("content-type") ?? "image/png";
      bytes = await res.arrayBuffer();
    }
    return { bytes, type, cost: data.usage?.cost ?? 0 };
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

  async chat(body: ChatRequest): Promise<ChatResult> {
    const data = (await (await this.request(`${this.base}/chat/completions`, { method: "POST", body: JSON.stringify(body) })).json()) as {
      choices?: { message?: { content?: string | null; images?: { image_url?: { url?: string } }[] } }[];
      usage?: { cost?: number };
    };
    const message = data.choices?.[0]?.message;
    return {
      text: message?.content ?? "",
      images: (message?.images ?? []).map((i) => i.image_url?.url).filter((u): u is string => Boolean(u)),
      cost: data.usage?.cost ?? 0,
    };
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

/** Um modelo como GET /images/models descreve (só o que o projeto usa). */
interface ImageModelInfo {
  id: string;
  name: string;
  supported_parameters?: { resolution?: { values: string[] }; aspect_ratio?: { values: string[] } };
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
