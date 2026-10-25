// Cliente mínimo da API de vídeo do OpenRouter.
// Docs: https://openrouter.ai/docs/guides/overview/multimodal/video-generation.md

import { readFile } from "node:fs/promises"
import { extname } from "node:path"

const API = "https://openrouter.ai/api/v1"

export type FrameType = "first_frame" | "last_frame"

export interface VideoModel {
  id: string
  name: string
  supported_durations: number[] | null
  supported_resolutions: string[] | null
  supported_aspect_ratios: string[] | null
  supported_frame_images: FrameType[] | null
  generate_audio: boolean | null
  pricing_skus: Record<string, string> | null
}

export interface VideoRequest {
  model: string
  prompt: string
  duration?: number
  resolution?: string
  aspect_ratio?: string
  generate_audio?: boolean
  seed?: number
  frame_images?: {
    type: "image_url"
    image_url: { url: string }
    frame_type: FrameType
  }[]
}

export type JobStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired"

export interface VideoJob {
  id: string
  status: JobStatus
  polling_url?: string
  generation_id?: string
  unsigned_urls?: string[]
  usage?: { cost?: number; is_byok?: boolean }
  error?: string
}

export class OpenRouterVideo {
  constructor(private readonly apiKey: string) {}

  static async listModels(): Promise<VideoModel[]> {
    const res = await fetch(`${API}/videos/models`)
    if (!res.ok) throw new Error(`Falha ao listar modelos: HTTP ${res.status} ${await res.text()}`)
    return ((await res.json()) as { data: VideoModel[] }).data
  }

  static async getModel(id: string): Promise<VideoModel> {
    const model = (await OpenRouterVideo.listModels()).find((m) => m.id === id)
    if (!model) throw new Error(`Modelo ${id} não encontrado em ${API}/videos/models`)
    return model
  }

  async submit(body: VideoRequest): Promise<VideoJob> {
    return (await this.request(`${API}/videos`, { method: "POST", body: JSON.stringify(body) })).json() as Promise<VideoJob>
  }

  async get(job: VideoJob): Promise<VideoJob> {
    const url = new URL(job.polling_url ?? `/api/v1/videos/${job.id}`, "https://openrouter.ai")
    return (await this.request(url.href)).json() as Promise<VideoJob>
  }

  async waitFor(
    job: VideoJob,
    { intervalMs = 20_000, maxAttempts = 90, onStatus }: { intervalMs?: number; maxAttempts?: number; onStatus?: (job: VideoJob) => void } = {},
  ): Promise<VideoJob> {
    let current = job
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      onStatus?.(current)
      if (current.status === "completed") return current
      if (current.status === "failed" || current.status === "cancelled" || current.status === "expired") {
        throw new Error(`Geração terminou com status ${current.status}: ${current.error ?? "sem detalhes"}`)
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      current = await this.get(current)
    }
    throw new Error(`Tempo esgotado. Consulte depois: ${API}/videos/${current.id}`)
  }

  async download(job: VideoJob, index = 0): Promise<Buffer> {
    const url = job.unsigned_urls?.[index] ?? `${API}/videos/${job.id}/content?index=${index}`
    return Buffer.from(await (await this.request(url)).arrayBuffer())
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...init.headers },
    })
    if (!res.ok) throw new Error(`Erro HTTP ${res.status} em ${url}:\n${await res.text()}`)
    return res
  }
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }

/** Aceita URL pública ou arquivo local (convertido em data URL base64). */
export async function imageUrl(source: string): Promise<string> {
  if (/^(https?:|data:)/.test(source)) return source
  const mime = MIME[extname(source).toLowerCase()] ?? "image/jpeg"
  return `data:${mime};base64,${(await readFile(source)).toString("base64")}`
}

/** Valida duração, resolução e formato contra o que o modelo aceita. */
export function validate(model: VideoModel, req: VideoRequest): string[] {
  const errors: string[] = []
  const check = (label: string, value: string | number | undefined, allowed: (string | number)[] | null) => {
    if (value !== undefined && allowed && !allowed.includes(value)) errors.push(`${label} ${value} (aceitos: ${allowed.join(", ")})`)
  }
  check("duração", req.duration, model.supported_durations)
  check("resolução", req.resolution, model.supported_resolutions)
  check("formato", req.aspect_ratio, model.supported_aspect_ratios)
  for (const frame of req.frame_images ?? []) check("quadro", frame.frame_type, model.supported_frame_images)
  return errors
}

/** Custo estimado em US$ a partir do preço por segundo da resolução. */
export function estimateCost(model: VideoModel, req: VideoRequest): number | undefined {
  const price = model.pricing_skus?.[`duration_seconds_${req.resolution}`]
  return price && req.duration ? Number(price) * req.duration : undefined
}
