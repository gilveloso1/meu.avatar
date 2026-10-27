import { type AudioApi, ContainerAudio } from "./audio";
import { Accounts } from "./auth";
import { Db } from "./db";
import type { Env } from "./env";
import { OpenRouterVideo, verifySignature, type VideoApi } from "./openrouter";
import { Site } from "./site/site";
import { Studio } from "./studio";

export { AudioFixer } from "./audio";

export interface Deps {
  api?: VideoApi | null;
  audio?: AudioApi | null;
}

export function createStudio(env: Env, deps: Deps = {}): Studio {
  const api = deps.api !== undefined ? deps.api : env.OPENROUTER_API_KEY ? new OpenRouterVideo(env.OPENROUTER_API_KEY) : null;
  const audio = deps.audio !== undefined ? deps.audio : env.AUDIO ? new ContainerAudio(env.AUDIO) : null;
  return new Studio(new Db(env.DB), env.MIDIA, api, { siteUrl: env.SITE_URL }, audio);
}

export function createAccounts(env: Env): Accounts {
  return new Accounts(new Db(env.DB), Number(env.BCRYPT_COST) || 12);
}

export function createSite(env: Env, studio: Studio): Site {
  return new Site(new Db(env.DB), env.MIDIA, studio, createAccounts(env), {
    defaults: {
      duration: Number(env.VIDEO_DURATION),
      resolution: env.VIDEO_RESOLUTION,
      aspectRatio: env.VIDEO_ASPECT_RATIO,
    },
  });
}

export async function handle(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);

  // www.<domínio> vai para o domínio sem www: um endereço só, com um cookie de sessão só.
  const site = new URL(env.SITE_URL);
  if (url.hostname === `www.${site.hostname}`) {
    return Response.redirect(`${site.origin}${url.pathname}${url.search}`, 301);
  }

  const studio = createStudio(env, deps);

  // Aviso do OpenRouter de que um job terminou. Com o segredo de assinatura
  // configurado, a assinatura é conferida; de qualquer jeito o status vem da
  // própria API, nunca do corpo do aviso.
  if (request.method === "POST" && url.pathname === "/openrouter/webhook") {
    const raw = await request.text();
    if (env.OPENROUTER_WEBHOOK_SECRET && !(await verifySignature(raw, request.headers.get("X-OpenRouter-Signature"), env.OPENROUTER_WEBHOOK_SECRET))) {
      return new Response("unauthorized", { status: 401 });
    }
    let payload: unknown = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("bad request", { status: 400 });
    }
    try {
      await studio.onWebhook(payload);
    } catch (err) {
      // 500: o OpenRouter tenta de novo; e o agendamento também confere.
      console.error("Erro ao processar aviso do OpenRouter", err);
      return new Response("error", { status: 500 });
    }
    return new Response("ok");
  }

  return createSite(env, studio).handle(request);
}

export default {
  fetch: (request, env) => handle(request, env),

  // Rede de segurança: confere os vídeos que ainda estão na fila, caso o aviso se perca.
  async scheduled(_controller, env): Promise<void> {
    const studio = createStudio(env);
    await studio.syncOpen();
    // Depois de buscar os prontos, trata o áudio de um vídeo da fila e faz uma edição rápida pedida.
    await studio.treatNextAudio();
    await studio.editNext();
  },
} satisfies ExportedHandler<Env>;
