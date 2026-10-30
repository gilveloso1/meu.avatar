// Cliente da API direta da HeyGen (v3): sobe arquivos, gera o vídeo do Avatar IV
// a partir de uma foto, lista as vozes, clona voz e gera fala.
// Docs: https://developers.heygen.com/llms.txt (lidas em 29/10/2026; ver
// docs/modelos/heygen-avatar-iv.md). Só usa fetch: roda no Worker.

export const HEYGEN_API = "https://api.heygen.com";

/** Arquivo que vai para a HeyGen: um asset já enviado. */
export type HeyGenSource = { type: "asset_id"; asset_id: string };

/** POST /v3/videos com uma foto (type "image"): fala por texto (script + voice_id) ou por áudio. */
export interface HeyGenVideoRequest {
  type: "image";
  image: HeyGenSource;
  script?: string;
  voice_id?: string;
  voice_settings?: { locale?: string };
  audio_url?: string;
  audio_asset_id?: string;
  resolution: string;
  aspect_ratio: string;
  expressiveness?: string;
  motion_prompt?: string;
  callback_url?: string;
  callback_id?: string;
}

export type HeyGenStatus = "pending" | "processing" | "completed" | "failed";

/** GET /v3/videos/{id}: a HeyGen não informa o custo; ele sai da duração. */
export interface HeyGenVideo {
  id: string;
  status: HeyGenStatus;
  video_url?: string | null;
  duration?: number | null;
  failure_code?: string | null;
  failure_message?: string | null;
}

/** Uma voz pronta do catálogo (GET /v3/voices). */
export interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  support_locale: boolean;
}

export type CloneStatus = { status: "PENDING" | "ACTIVE" | "FAILED"; failure_reason?: string | null };

/** O que o resto do projeto usa da API; os testes trocam por uma falsa. */
export interface HeyGenApi {
  uploadAsset(bytes: ArrayBuffer, type: string, name: string): Promise<string>;
  createVideo(body: HeyGenVideoRequest): Promise<{ video_id: string }>;
  getVideo(id: string): Promise<HeyGenVideo>;
  download(url: string): Promise<ArrayBuffer>;
  /** Vozes prontas em português (as multilíngues também falam português). */
  voices(): Promise<HeyGenVoice[]>;
  /** Clone instantâneo a partir de um áudio já enviado; devolve o id da voz (fica PENDING). */
  cloneVoice(name: string, assetId: string): Promise<string>;
  cloneStatus(voiceId: string): Promise<CloneStatus>;
  /** Fala de uma voz clonada (texto para fala); devolve a URL do áudio. */
  speech(voiceId: string, text: string): Promise<string>;
}

export class HeyGenClient implements HeyGenApi {
  constructor(
    private readonly apiKey: string,
    private readonly base = HEYGEN_API,
  ) {}

  async uploadAsset(bytes: ArrayBuffer, type: string, name: string): Promise<string> {
    const form = new FormData();
    form.set("file", new File([bytes], name, { type }));
    const data = await this.json<{ asset_id: string }>("/v3/assets", { method: "POST", body: form });
    return data.asset_id;
  }

  createVideo(body: HeyGenVideoRequest): Promise<{ video_id: string }> {
    return this.json("/v3/videos", { method: "POST", body: JSON.stringify(body) });
  }

  getVideo(id: string): Promise<HeyGenVideo> {
    return this.json(`/v3/videos/${encodeURIComponent(id)}`);
  }

  async download(url: string): Promise<ArrayBuffer> {
    // URL pré-assinada: vai sem a chave.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download do vídeo da HeyGen: HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  async voices(): Promise<HeyGenVoice[]> {
    const res = await fetch(`${this.base}/v3/voices?type=public&language=Portuguese&limit=100`, { headers: this.headers() });
    if (!res.ok) throw new Error(`HeyGen respondeu HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return ((await res.json()) as { data: HeyGenVoice[] }).data;
  }

  async cloneVoice(name: string, assetId: string): Promise<string> {
    const data = await this.json<{ voice_id: string }>("/v3/models/audio/voices", {
      method: "POST",
      body: JSON.stringify({ mode: "instant", name: name.slice(0, 64), audio: [{ type: "asset_id", asset_id: assetId }], language: "pt" }),
    });
    return data.voice_id;
  }

  cloneStatus(voiceId: string): Promise<CloneStatus> {
    return this.json(`/v3/models/audio/voices/${encodeURIComponent(voiceId)}`);
  }

  async speech(voiceId: string, text: string): Promise<string> {
    const data = await this.json<{ audio_url: string }>("/v3/models/audio/tts", {
      method: "POST",
      body: JSON.stringify({ voice_id: voiceId, text, language: "pt" }),
    });
    return data.audio_url;
  }

  private headers(json = false): Record<string, string> {
    return { "x-api-key": this.apiKey, ...(json ? { "content-type": "application/json" } : {}) };
  }

  /** Chama a API e devolve o `data` da resposta; erro com o código e a mensagem da HeyGen. */
  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { ...init, headers: this.headers(typeof init.body === "string") });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        const err = (JSON.parse(text) as { error?: { code?: string; message?: string } }).error;
        if (err) detail = `${err.code ?? ""}: ${err.message ?? ""}`;
      } catch {}
      throw new Error(`HeyGen respondeu HTTP ${res.status} (${path}) ${detail}`);
    }
    return (JSON.parse(text) as { data: T }).data;
  }
}
