import { env } from "cloudflare:workers";
import { handle } from "../src/index";
import type { AudioApi, ContainerPlan, Face } from "../src/audio";
import { randomToken, sha256 } from "../src/auth";
import type { VideoApi, VideoJob, VideoModel, VideoRequest } from "../src/openrouter";

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

const MODELS = [WAN, HEYGEN, SEEDANCE];

/**
 * Um MP4 mínimo com a duração no cabeçalho (ftyp, mdat e moov > mvhd). A
 * versão 1 do mvhd usa campos de 64 bits; `moovFirst` põe o moov antes do mdat.
 */
export function fakeMp4(seconds: number, { version = 0, moovFirst = false } = {}): Uint8Array<ArrayBuffer> {
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
  const moov = box("moov", box("mvhd", mvhd));
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
  private async answer(mp4: ReadableStream, size: number, suffix: string) {
    const original = new Uint8Array(await new Response(mp4).arrayBuffer());
    if (original.length !== size) throw new Error(`tamanho errado: ${original.length} != ${size}`);
    if (this.fail) throw new Error(this.fail);
    const out = new TextEncoder().encode(new TextDecoder().decode(original) + suffix);
    return new Response(out, { headers: { "content-length": String(out.length), "content-type": "video/mp4" } });
  }
}

export function call(request: Request, api: VideoApi | null = new FakeVideoApi(), audio: AudioApi | null = null): Promise<Response> {
  return handle(request, { ...env, SITE_URL: SITE }, { api, audio });
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
