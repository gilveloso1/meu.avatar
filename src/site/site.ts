/**
 * O estúdio: páginas em HTML montado no Worker, com CSS e um script pequeno
 * embutidos (o mesmo jeito do blog do anb.bot), no Material Design 3.
 *
 *   /cadastro   cria a primeira conta, que é a do administrador; depois fecha
 *   /entrar     login (e-mail e senha)
 *   /sair       encerra a sessão (POST)
 *   /           formulário e vídeos (precisa de sessão)
 *
 * Tudo pede sessão, menos /midia/avatares/..., que o provedor de vídeo precisa
 * baixar. Segurança como no painel do estuda.mais: cookie __Host- (HttpOnly,
 * Secure, SameSite=Strict), todo POST precisa vir do próprio site (cabeçalho
 * Origin), páginas sem cache e sem abrir dentro de outros sites, e o script
 * da página só roda com o nonce da CSP.
 */
import { type Accounts, PASSWORD_MAX, PASSWORD_MIN, SESSION_DAYS } from "../auth";
import type { Db, User, Video, VideoStatus } from "../db";
import type { VideoModel } from "../openrouter";
import { InputError, MAX_IMAGE_BYTES, type Studio } from "../studio";
import { CSS } from "./style";
import { DARK, LIGHT } from "./theme";

export interface SiteConfig {
  defaults: { model: string; duration: number; resolution: string; aspectRatio: string };
}

const SITE_NAME = "meu.avatar";
export const SESSION_COOKIE = "__Host-sessao";
/** Enquanto há vídeo na fila, a página confere de novo a cada tantos segundos. */
const REFRESH_SECONDS = 20;

/** Ícones usados (Material Symbols); a fonte só baixa esses. */
const ICONS = [
  "add_photo_alternate", "arrow_drop_down", "check_circle", "close", "download", "error", "face", "hourglass_top", "lock", "logout", "person_add", "movie", "progress_activity", "schedule",
  "send", "videocam",
];

const SURFACE_LIGHT = /--md-sys-color-surface: (#\w+)/.exec(LIGHT)![1];
const SURFACE_DARK = /--md-sys-color-surface: (#\w+)/.exec(DARK)![1];

const STATUS: Record<VideoStatus, { label: string; icon: string; kind: "busy" | "done" | "error" }> = {
  submitting: { label: "Enviando", icon: "send", kind: "busy" },
  pending: { label: "Na fila", icon: "schedule", kind: "busy" },
  in_progress: { label: "Gerando", icon: "hourglass_top", kind: "busy" },
  completed: { label: "Pronto", icon: "check_circle", kind: "done" },
  failed: { label: "Falhou", icon: "error", kind: "error" },
  cancelled: { label: "Cancelado", icon: "error", kind: "error" },
  expired: { label: "Expirou", icon: "error", kind: "error" },
};

export class Site {
  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly studio: Studio,
    private readonly accounts: Accounts,
    private readonly config: SiteConfig,
  ) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const post = request.method === "POST";
    if (!post && request.method !== "GET" && request.method !== "HEAD") return new Response("método não permitido", { status: 405 });

    // A foto do avatar é baixada pelo provedor de vídeo, sem login.
    if (!post && path.startsWith("/midia/avatares/")) {
      return this.object(request, path.slice("/midia/".length), "public, max-age=86400");
    }

    // Formulário de outro site tentando agir em nome de quem está logado.
    if (post && !sameSite(request, url)) return new Response("forbidden", { status: 403 });

    if (path === "/cadastro") return post ? this.signup(request) : this.signupPage();
    if (path === "/entrar") {
      if (post) return this.login(request);
      return (await this.accounts.signupOpen()) ? redirect("/cadastro") : html(loginPage());
    }

    const token = sessionToken(request);
    if (path === "/sair" && post) {
      await this.accounts.logout(token);
      return redirect("/entrar", clearCookie());
    }
    const user = await this.accounts.session(token);
    if (!user) return redirect("/entrar");

    if (post && path === "/videos") return this.createVideo(request, user);
    if (!post && path === "/") return this.home(url, user);

    const file = /^\/videos\/([0-9a-f-]{36})\.mp4$/.exec(path);
    if (request.method === "GET" && file) {
      const video = await this.db.videoById(file[1]!);
      if (!video?.video_key) return new Response("não encontrado", { status: 404 });
      return this.object(request, video.video_key, "private, max-age=86400", url.searchParams.has("baixar") ? `meu-avatar-${video.id.slice(0, 8)}.mp4` : undefined);
    }

    return new Response("não encontrado", { status: 404 });
  }

  private async home(url: URL, user: User): Promise<Response> {
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
    const waiting = videos.some((v) => STATUS[v.status].kind === "busy");
    const error = url.searchParams.get("erro");
    const banner = modelError ?? (this.studio.canGenerate ? null : "Falta a chave do OpenRouter (segredo OPENROUTER_API_KEY): dá para ver os vídeos, mas não gerar novos.");

    const body = `
<main class="page" id="conteudo">
  ${this.composer(model, banner)}
  <section class="gallery" aria-labelledby="videos">
    <h2 class="gallery__heading" id="videos">Vídeos</h2>
    ${
      videos.length
        ? `<div class="gallery__grid">${videos.map(videoCard).join("")}</div>`
        : `<div class="empty"><span class="icon">movie</span><p class="empty__title">Nenhum vídeo ainda</p><p>Escreva o prompt e gere o primeiro.</p></div>`
    }
  </section>
</main>
${error ? snackbar(error) : ""}`;
    return html(page("meu.avatar", body, { refresh: waiting, user }));
  }

  private composer(model: VideoModel | null, banner: string | null): string {
    const d = this.config.defaults;
    const durations = model?.supported_durations ?? range(2, 30);
    const resolutions = model?.supported_resolutions ?? [d.resolution];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    const prices = JSON.stringify(model?.pricing_skus ?? {}).replace(/</g, "\\u003c");
    return `
<form class="card card--outlined composer" method="post" action="/videos" enctype="multipart/form-data" data-composer data-prices='${esc(prices)}'>
  <h1 class="composer__title">Novo vídeo</h1>
  ${banner ? `<p class="banner" role="status"><span class="icon">error</span>${esc(banner)}</p>` : ""}
  <div class="text-field">
    <textarea class="text-field__input" id="prompt" name="prompt" required maxlength="4000" placeholder="Quem é o avatar, cenário e câmera, a fala exata entre aspas, tom de voz e gestos, áudio." aria-describedby="prompt-ajuda"></textarea>
    <label class="text-field__label" for="prompt">Prompt completo</label>
    <p class="text-field__supporting" id="prompt-ajuda"><span data-words>Fala de 25 s: umas 55 a 65 palavras.</span><span data-count>0/4000</span></p>
  </div>
  <label class="file-picker">
    <input type="file" name="imagem" accept="image/jpeg,image/png,image/webp" data-image>
    <span class="button button--tonal interactive"><span class="icon">add_photo_alternate</span>Foto do avatar</span>
    <span class="file-picker__preview" data-preview><span class="icon">face</span></span>
    <span class="file-picker__text">
      <span class="file-picker__name" data-image-name>Opcional</span>
      <span class="file-picker__hint">Vira o primeiro quadro. JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB.</span>
    </span>
  </label>
  <div class="composer__row">
    ${select("duracao", "Duração", durations.map(String), String(d.duration), (s) => `${s} s`)}
    ${select("resolucao", "Resolução", resolutions, d.resolution)}
    ${select("formato", "Formato", ratios, d.aspectRatio)}
  </div>
  <input type="hidden" name="modelo" value="${esc(d.model)}">
  <div class="composer__actions">
    <span class="composer__cost" data-cost>${esc(d.model)}</span>
    <button class="button button--filled interactive" type="submit"${model ? "" : " disabled"}><span class="icon">videocam</span>Gerar vídeo</button>
  </div>
</form>`;
  }

  private async createVideo(request: Request, user: User): Promise<Response> {
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
        userId: user.id,
      });
    } catch (err) {
      if (!(err instanceof InputError)) throw err;
      return redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
    return redirect("/");
  }

  private async login(request: Request): Promise<Response> {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const result = await this.accounts.login(email, String(form.get("senha") ?? ""));
    if (result.ok) return redirect("/", sessionCookie(result.token));
    if (result.reason === "locked") {
      return html(loginPage(`Muitas tentativas erradas. A conta fica bloqueada até ${formatDate(result.until)}.`, email), 400);
    }
    return html(loginPage("E-mail ou senha não conferem.", email), 400);
  }

  private async signupPage(error?: string, values: { name?: string; email?: string } = {}): Promise<Response> {
    if (!(await this.accounts.signupOpen())) return html(closedPage(), 403);
    return html(signupPage(error, values), error ? 400 : 200);
  }

  private async signup(request: Request): Promise<Response> {
    const form = await request.formData();
    const name = String(form.get("nome") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("senha") ?? "");
    if (password !== String(form.get("confirmar") ?? "")) return this.signupPage("As senhas não são iguais.", { name, email });
    const result = await this.accounts.signupFirst(name, email, password);
    if ("error" in result) return this.signupPage(result.error, { name, email });
    return redirect("/", sessionCookie(result.token));
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
  const status = STATUS[v.status];
  const ratio = /^(\d+):(\d+)$/.exec(v.aspect_ratio);
  const style = [
    ratio ? `--ratio:${ratio[1]} / ${ratio[2]}` : "",
    !v.video_key && v.image_key ? `background-image:url('/midia/${esc(v.image_key)}')` : "",
  ].filter(Boolean).join(";");
  const media = v.video_key
    ? `<video controls preload="metadata" playsinline src="/videos/${v.id}.mp4"></video>`
    : `${v.image_key ? "" : `<span class="icon">${status.kind === "error" ? "error" : "movie"}</span>`}${
        status.kind === "busy" ? `<div class="linear-progress" role="progressbar" aria-label="${esc(status.label)}"></div>` : ""
      }`;
  const meta = [
    v.model.replace(/^[^/]+\//, ""),
    `${v.duration} s`,
    v.resolution,
    v.aspect_ratio,
    v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : null,
    formatDate(v.created_at),
  ].filter((m): m is string => Boolean(m));
  const chipClass = status.kind === "done" ? " chip--selected" : status.kind === "error" ? " chip--error" : "";
  return `
<article class="card card--elevated video-card">
  <div class="video-card__media"${style ? ` style="${style}"` : ""}>${media}</div>
  <div class="video-card__body">
    <span class="chip${chipClass}"><span class="icon">${status.icon}</span>${esc(status.label)}</span>
    <details class="video-card__prompt"><summary class="interactive">${esc(v.prompt)}</summary></details>
    <p class="video-card__meta">${meta.map(esc).join(" · ")}</p>
    ${v.error ? `<p class="video-card__error">${esc(v.error)}</p>` : ""}
  </div>
  ${
    v.video_key
      ? `<div class="video-card__actions"><a class="button button--text interactive" href="/videos/${v.id}.mp4?baixar" download><span class="icon">download</span>Baixar MP4</a></div>`
      : ""
  }
</article>`;
}

function loginPage(error?: string, email = ""): string {
  return authPage(
    "Entrar",
    "Estúdio de vídeos com avatar.",
    `<form class="card card--outlined login" method="post" action="/entrar">
    ${authHead("Entrar", "Estúdio de vídeos com avatar.")}
    ${textField("email", "E-mail", `type="email" autocomplete="username" required autofocus value="${esc(email)}"`)}
    ${textField("senha", "Senha", `type="password" autocomplete="current-password" required`)}
    <button class="button button--filled interactive" type="submit"><span class="icon">lock</span>Entrar</button>
  </form>`,
    error,
  );
}

function signupPage(error?: string, values: { name?: string; email?: string } = {}): string {
  return authPage(
    "Criar conta",
    "",
    `<form class="card card--outlined login" method="post" action="/cadastro">
    ${authHead("Criar conta", "A primeira conta é a do administrador. Depois dela, o cadastro fecha.")}
    ${textField("nome", "Nome", `type="text" autocomplete="name" required autofocus maxlength="80" value="${esc(values.name ?? "")}"`)}
    ${textField("email", "E-mail", `type="email" autocomplete="username" required value="${esc(values.email ?? "")}"`)}
    ${textField("senha", "Senha", `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`, `De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`)}
    ${textField("confirmar", "Repita a senha", `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`)}
    <button class="button button--filled interactive" type="submit"><span class="icon">person_add</span>Criar conta</button>
  </form>`,
    error,
  );
}

function closedPage(): string {
  return authPage(
    "Cadastro fechado",
    "",
    `<div class="card card--outlined login">
    ${authHead("Cadastro fechado", "O estúdio já tem administrador. Novas contas só por convite dele.")}
    <a class="button button--filled interactive" href="/entrar"><span class="icon">lock</span>Entrar</a>
  </div>`,
  );
}

function authHead(title: string, text: string): string {
  return `<div class="login__head">
      <span class="top-app-bar__logo"><span class="icon">videocam</span></span>
      <h1 class="login__title">${esc(title)}</h1>
      ${text ? `<p class="login__text">${esc(text)}</p>` : ""}
    </div>`;
}

function authPage(title: string, _description: string, form: string, error?: string): string {
  return page(`${title} · ${SITE_NAME}`, `<main id="conteudo">${form}</main>${error ? snackbar(error) : ""}`, { bar: false });
}

function textField(name: string, label: string, attrs: string, supporting?: string): string {
  return `<div class="text-field">
      <input class="text-field__input" id="${name}" name="${name}" ${attrs} placeholder=" ">
      <label class="text-field__label" for="${name}">${esc(label)}</label>
      ${supporting ? `<p class="text-field__supporting"><span>${esc(supporting)}</span></p>` : ""}
    </div>`;
}

function snackbar(text: string): string {
  return `<div class="snackbar" role="alert" data-snackbar>
  <span class="snackbar__text">${esc(text)}</span>
  <button type="button" class="icon-button interactive" aria-label="Fechar" data-snackbar-close style="color:inherit"><span class="icon">close</span></button>
</div>`;
}

function page(title: string, body: string, opts: { refresh?: boolean; bar?: boolean; user?: User } = {}): string {
  const bar =
    opts.bar === false
      ? ""
      : `<header class="top-app-bar" data-app-bar>
  <a class="top-app-bar__brand" href="/">
    <span class="top-app-bar__logo"><span class="icon">videocam</span></span>
    <span class="top-app-bar__title">${SITE_NAME}</span>
  </a>
  ${opts.user ? `<span class="top-app-bar__user" title="${esc(opts.user.email)}">${esc(opts.user.name)}</span>` : ""}
  <form method="post" action="/sair"><button class="icon-button interactive" type="submit" aria-label="Sair" title="Sair"><span class="icon">logout</span></button></form>
</header>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(title)}</title>
  <meta name="theme-color" content="${SURFACE_LIGHT}" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="${SURFACE_DARK}" media="(prefers-color-scheme: dark)">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${[...ICONS].sort().join(",")}&display=block">
  <style>${CSS}</style>
</head>
<body${opts.refresh ? ` data-refresh="${REFRESH_SECONDS}"` : ""}>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  ${bar}
  ${body}
  <footer class="footer"><div class="footer__inner"><p class="footer__text">Vídeos gerados com inteligência artificial pelo OpenRouter.</p></div></footer>
  <script nonce="${NONCE}">${SCRIPT}</script>
</body>
</html>`;
}

/** Barra que muda de cor ao rolar, custo estimado, contador do prompt, prévia da foto e atualização da fila. */
const SCRIPT = `(() => {
  const bar = document.querySelector("[data-app-bar]");
  if (bar) {
    const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 0);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  document.addEventListener("click", (e) => {
    const close = e.target instanceof Element && e.target.closest("[data-snackbar-close]");
    if (close) close.closest("[data-snackbar]").hidden = true;
  });
  if (location.search.includes("erro=")) history.replaceState(null, "", location.pathname);

  const f = document.querySelector("[data-composer]");
  if (f) {
    const prices = JSON.parse(f.dataset.prices || "{}");
    const cost = f.querySelector("[data-cost]"), model = f.modelo.value;
    const words = f.querySelector("[data-words]"), count = f.querySelector("[data-count]");
    const update = () => {
      const p = Number(prices["duration_seconds_" + f.resolucao.value]);
      cost.innerHTML = p ? model + " · <strong>US$ " + (p * f.duracao.value).toFixed(2) + "</strong> estimado" : model;
      // Fala natural: umas 2,2 a 2,6 palavras por segundo.
      const s = Number(f.duracao.value);
      const spoken = (f.prompt.value.match(/["“”«»]([^"“”«»]*)["“”«»]/g) || []).join(" ").split(/\\s+/).filter(Boolean).length;
      words.textContent = "Fala de " + s + " s: umas " + Math.round(s * 2.2) + " a " + Math.round(s * 2.6) + " palavras" + (spoken ? " (entre aspas: " + spoken + ")" : "") + ".";
      count.textContent = f.prompt.value.length + "/4000";
    };
    f.addEventListener("change", update);
    f.prompt.addEventListener("input", update);
    update();

    const image = f.querySelector("[data-image]"), preview = f.querySelector("[data-preview]"), name = f.querySelector("[data-image-name]");
    image.addEventListener("change", () => {
      const file = image.files[0];
      name.textContent = file ? file.name : "Opcional";
      preview.innerHTML = file ? '<img alt="">' : '<span class="icon">face</span>';
      if (file) preview.firstChild.src = URL.createObjectURL(file);
    });

    f.addEventListener("submit", () => { f.querySelector("[type=submit]").disabled = true; });
  }

  // Vídeo na fila: confere de novo de tempos em tempos, sem perder o que está sendo escrito.
  const refresh = Number(document.body.dataset.refresh);
  if (refresh) setInterval(() => {
    if (!f || (!f.prompt.value && !f.imagem.files.length)) location.reload();
  }, refresh * 1000);
})();`;

function select(name: string, label: string, options: string[], selected: string, text: (s: string) => string = (s) => s): string {
  return `<div class="text-field text-field--select">
  <select class="text-field__input" id="${name}" name="${name}">${options
    .map((o) => `<option value="${esc(o)}"${o === selected ? " selected" : ""}>${esc(text(o))}</option>`)
    .join("")}</select>
  <label class="text-field__label" for="${name}">${esc(label)}</label>
  <span class="icon text-field__trailing" aria-hidden="true">arrow_drop_down</span>
</div>`;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Marca no lugar do nonce do script; html() troca por um valor novo a cada resposta. */
const NONCE = "{{nonce}}";

function html(body: string, status = 200): Response {
  const nonce = randomNonce();
  return new Response(body.replaceAll(`nonce="${NONCE}"`, `nonce="${nonce}"`), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS, "content-security-policy": csp(nonce) },
  });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, ...SECURITY_HEADERS });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  // Não "no-referrer": com ele, o navegador manda Origin: null nos formulários do próprio site.
  "referrer-policy": "same-origin",
};

/** Só o script da própria página (com o nonce); fotos de prévia vêm de blob:. */
function csp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' blob:",
    "media-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");
}

function randomNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * O formulário veio de uma página do próprio estúdio? Vale o Origin igual ao
 * do site ou, quando o navegador manda Origin "null", o Sec-Fetch-Site
 * "same-origin", que só o navegador consegue pôr. (Como no estuda.mais.)
 */
function sameSite(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin === url.origin) return true;
  return (origin === null || origin === "null") && request.headers.get("sec-fetch-site") === "same-origin";
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86_400}`;
}

function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sessionToken(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([\\w-]+)`).exec(cookies);
  return match ? match[1]! : null;
}
