/**
 * O estúdio: páginas em HTML montado no Worker, com CSS e poucas linhas de
 * script embutidos (o mesmo jeito do blog do anb.bot). Tudo atrás da senha
 * ACCESS_TOKEN, menos /midia/avatares/..., que o provedor de vídeo precisa baixar.
 */
import type { Db, Video, VideoStatus } from "../db";
import type { VideoModel } from "../openrouter";
import { InputError, MAX_IMAGE_BYTES, type Studio } from "../studio";
import { CSS } from "./style";

export interface SiteConfig {
  /** Senha do estúdio; sem ela ninguém entra. */
  accessToken?: string;
  defaults: { model: string; duration: number; resolution: string; aspectRatio: string };
}

const COOKIE = "sessao";
const ONE_YEAR = 60 * 60 * 24 * 365;

const STATUS_LABEL: Record<VideoStatus, string> = {
  submitting: "Enviando",
  pending: "Na fila",
  in_progress: "Gerando",
  completed: "Pronto",
  failed: "Falhou",
  cancelled: "Cancelado",
  expired: "Expirou",
};

export class Site {
  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly studio: Studio,
    private readonly config: SiteConfig,
  ) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // A foto do avatar é baixada pelo provedor de vídeo, sem login.
    if (request.method === "GET" && path.startsWith("/midia/avatares/")) {
      return this.object(request, path.slice("/midia/".length), "public, max-age=86400");
    }

    if (path === "/entrar") {
      if (request.method === "POST") return this.login(request);
      return html(loginPage());
    }
    if (path === "/sair") return redirect("/", clearCookie());

    if (!(await this.authorized(request))) return redirect("/entrar");

    if (request.method === "POST" && path === "/videos") return this.createVideo(request);
    if (request.method === "GET" && path === "/") return this.home(url);

    const file = /^\/videos\/([0-9a-f-]{36})\.mp4$/.exec(path);
    if (request.method === "GET" && file) {
      const video = await this.db.videoById(file[1]!);
      if (!video?.video_key) return new Response("não encontrado", { status: 404 });
      return this.object(request, video.video_key, "private, max-age=86400", url.searchParams.has("baixar") ? `meu-avatar-${video.id.slice(0, 8)}.mp4` : undefined);
    }

    return new Response("não encontrado", { status: 404 });
  }

  private async home(url: URL): Promise<Response> {
    let model: VideoModel | null = null;
    let modelError: string | null = null;
    if (this.studio.canGenerate) {
      try {
        model = await this.studio.model(this.config.defaults.model);
      } catch (err) {
        modelError = `Não deu para ler o modelo ${this.config.defaults.model}: ${err instanceof Error ? err.message : err}`;
      }
    }
    const videos = await this.db.recentVideos();
    const waiting = videos.some((v) => v.status === "submitting" || v.status === "pending" || v.status === "in_progress");
    const notice = url.searchParams.get("erro") ?? modelError ?? (this.studio.canGenerate ? null : "Falta a chave do OpenRouter (segredo OPENROUTER_API_KEY): dá para ver os vídeos, mas não gerar novos.");

    const body = `
<header class="top-app-bar"><h1>meu.avatar</h1><a class="button text" href="/sair">Sair</a></header>
<main>
  ${notice ? `<p class="snackbar" role="alert">${esc(notice)}</p>` : ""}
  ${this.form(model)}
  <h2>Vídeos</h2>
  ${videos.length ? `<div class="videos">${videos.map((v) => videoCard(v)).join("")}</div>` : `<p class="empty">Nenhum vídeo ainda.</p>`}
</main>`;
    // Enquanto algum vídeo está na fila, a página se atualiza sozinha.
    return html(page("meu.avatar", body, waiting ? 20 : undefined));
  }

  private form(model: VideoModel | null): string {
    const d = this.config.defaults;
    const durations = model?.supported_durations ?? range(2, 30);
    const resolutions = model?.supported_resolutions ?? [d.resolution];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    const prices = JSON.stringify(model?.pricing_skus ?? {});
    const disabled = model ? "" : " disabled";
    return `
<form class="card" method="post" action="/videos" enctype="multipart/form-data" id="novo">
  <div class="field">
    <label for="prompt">Prompt completo</label>
    <textarea id="prompt" name="prompt" required maxlength="4000" placeholder="Quem é o avatar, cenário e câmera, a fala exata entre aspas, tom de voz e gestos, áudio."></textarea>
    <small id="palavras">Fala de 25 s: umas 55 a 65 palavras.</small>
  </div>
  <div class="field">
    <label for="imagem">Foto do avatar (opcional: vira o primeiro quadro)</label>
    <input id="imagem" name="imagem" type="file" accept="image/jpeg,image/png,image/webp">
    <small>JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB. De frente, com boa luz.</small>
  </div>
  <div class="row">
    <div class="field"><label for="duracao">Duração</label>${select("duracao", durations.map(String), String(d.duration), (s) => `${s} s`)}</div>
    <div class="field"><label for="resolucao">Resolução</label>${select("resolucao", resolutions, d.resolution)}</div>
    <div class="field"><label for="formato">Formato</label>${select("formato", ratios, d.aspectRatio)}</div>
  </div>
  <input type="hidden" name="modelo" value="${esc(d.model)}">
  <div class="actions">
    <button class="button" type="submit"${disabled}>Gerar vídeo</button>
    <span class="estimate" id="custo"></span>
  </div>
</form>
<script>
(() => {
  const f = document.getElementById("novo"), prices = ${prices.replace(/</g, "\\u003c")};
  const custo = document.getElementById("custo");
  const update = () => {
    const p = prices["duration_seconds_" + f.resolucao.value];
    custo.textContent = p ? "${esc(d.model)} · custo estimado US$ " + (p * f.duracao.value).toFixed(2) : "${esc(d.model)}";
  };
  f.addEventListener("change", update);
  update();
  f.addEventListener("submit", () => { f.querySelector("button").disabled = true; });
})();
</script>`;
  }

  private async createVideo(request: Request): Promise<Response> {
    const form = await request.formData();
    const d = this.config.defaults;
    const image = form.get("imagem");
    try {
      await this.studio.create({
        prompt: String(form.get("prompt") ?? ""),
        model: String(form.get("modelo") || d.model),
        duration: Number(form.get("duracao") || d.duration),
        resolution: String(form.get("resolucao") || d.resolution),
        aspectRatio: String(form.get("formato") || d.aspectRatio),
        image: image instanceof File ? image : null,
      });
    } catch (err) {
      if (!(err instanceof InputError)) throw err;
      return redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
    return redirect("/");
  }

  private async login(request: Request): Promise<Response> {
    const form = await request.formData();
    const token = this.config.accessToken;
    if (!token || String(form.get("senha") ?? "") !== token) {
      return html(loginPage(token ? "Senha errada." : "O estúdio está sem senha (segredo ACCESS_TOKEN)."), 401);
    }
    return redirect("/", `${COOKIE}=${await sessionValue(token)}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Strict`);
  }

  private async authorized(request: Request): Promise<boolean> {
    const token = this.config.accessToken;
    if (!token) return false;
    const cookie = request.headers.get("cookie") ?? "";
    const value = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return value === (await sessionValue(token));
  }

  /** Arquivo do R2, com suporte a Range (o player de vídeo pede pedaços). */
  private async object(request: Request, key: string, cache: string, downloadName?: string): Promise<Response> {
    const object = await this.media.get(key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response("não encontrado", { status: 404 });
    const headers = new Headers({ "cache-control": cache, "accept-ranges": "bytes", etag: object.httpEtag });
    object.writeHttpMetadata(headers);
    if (downloadName) headers.set("content-disposition", `attachment; filename="${downloadName}"`);
    if (!("body" in object)) return new Response(null, { status: 304, headers });
    const r = object.range as { offset?: number; length?: number } | undefined;
    if (request.headers.has("range") && r) {
      const offset = r.offset ?? 0;
      const length = r.length ?? object.size - offset;
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  }
}

function videoCard(v: Video): string {
  const media = v.video_key
    ? `<video controls preload="metadata" playsinline src="/videos/${v.id}.mp4"></video>`
    : `<div class="placeholder"${v.image_key ? ` style="background-image:url('/midia/${esc(v.image_key)}')"` : ""}><span>${esc(STATUS_LABEL[v.status])}</span></div>`;
  const meta = [
    v.model.replace(/^[^/]+\//, ""),
    `${v.duration} s`,
    v.resolution,
    v.aspect_ratio,
    v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : null,
    formatDate(v.created_at),
  ].filter((m): m is string => Boolean(m));
  return `
<article class="card video">
  ${media}
  <span class="chip ${v.status}">${esc(STATUS_LABEL[v.status])}</span>
  <details><summary>${esc(v.prompt)}</summary><p>${esc(v.prompt)}</p></details>
  <div class="meta">${meta.map(esc).join(" · ")}</div>
  ${v.error ? `<div class="error">${esc(v.error)}</div>` : ""}
  ${v.video_key ? `<a class="button text" href="/videos/${v.id}.mp4?baixar">Baixar MP4</a>` : ""}
</article>`;
}

function loginPage(error?: string): string {
  return page(
    "Entrar · meu.avatar",
    `<main><form class="card login" method="post" action="/entrar">
  <h1>meu.avatar</h1>
  ${error ? `<p class="snackbar" role="alert">${esc(error)}</p>` : ""}
  <div class="field"><label for="senha">Senha do estúdio</label><input id="senha" name="senha" type="password" required autofocus autocomplete="current-password"></div>
  <button class="button" type="submit">Entrar</button>
</form></main>`,
  );
}

function page(title: string, body: string, refreshSeconds?: number): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ""}
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function select(name: string, options: string[], selected: string, label: (s: string) => string = (s) => s): string {
  return `<select id="${name}" name="${name}">${options
    .map((o) => `<option value="${esc(o)}"${o === selected ? " selected" : ""}>${esc(label(o))}</option>`)
    .join("")}</select>`;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function sessionValue(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`meu.avatar:${token}`)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clearCookie(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
