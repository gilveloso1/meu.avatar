import { env } from "cloudflare:workers";
import { handle } from "../src/index";
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

/** OpenRouter de mentira: guarda os pedidos e responde o status que o teste mandar. */
export class FakeVideoApi implements VideoApi {
  submitted: VideoRequest[] = [];
  jobs = new Map<string, VideoJob>();
  downloads = 0;
  failSubmit: string | null = null;
  private next = 1;

  async getModel(id: string) {
    if (id !== WAN.id) throw new Error(`modelo ${id} não existe`);
    return WAN;
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

/** "__Host-sessao=<código>" do Set-Cookie da resposta. */
export function sessionPair(res: Response): string {
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

export function call(request: Request, api: VideoApi | null = new FakeVideoApi()): Promise<Response> {
  return handle(request, { ...env, SITE_URL: SITE }, { api });
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
