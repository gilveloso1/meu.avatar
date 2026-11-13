import { type FishApi, FishClient } from "./fish";
import { ALEPH } from "./structures/aleph";
import { type AudioApi, type AudioFixer, ContainerAudio } from "./audio";
import { Accounts } from "./auth";
import { type CustosApi, CustosReais, lerHeyGen, lerOpenRouter } from "./custos";
import { Db } from "./db";
import { DurableImages, type ImageRunner } from "./imagens";
import { DurableExports } from "./exportando";
import { type MaquinasApi, MaquinasReais } from "./maquinas";
import { ContainerExport, type ExportApi, type Exporter, Exports } from "./exportar";
import { HeyGenClient, type HeyGenApi } from "./heygen";
import type { Env } from "./env";
import { OpenRouterVideo, verifySignature, type VideoApi } from "./openrouter";
import { Site } from "./site/site";
import { ContainerRender, type RenderApi, type Renderer } from "./render";
import { Studio } from "./studio";
import { type Transcriber, WorkersAiTranscriber } from "./transcricao";
import { Painel, type Vigiado, vigiar } from "./vigia";

export { AudioFixer } from "./audio";
export { Exporter } from "./exportar";
export { Renderer } from "./render";
export { ImageMaker } from "./imagens";
export { ExportMaker } from "./exportando";

export interface Deps {
  api?: VideoApi | null;
  audio?: AudioApi | null;
  heygen?: HeyGenApi | null;
  exporter?: ExportApi | null;
  transcriber?: Transcriber | null;
  renderer?: RenderApi | null;
  /** Os custos de fora do banco, na aba Custos do painel (src/custos.ts). */
  costs?: CustosApi | null;
  /** O estado das máquinas, na aba Atividade do painel (src/maquinas.ts). */
  machines?: MaquinasApi | null;
  /** Quem faz a imagem fora do pedido (src/imagens.ts). */
  images?: ImageRunner | null;
  /** O catálogo das vozes oficiais do Fish (src/fish.ts). */
  fish?: FishApi | null;
}

export function createExports(env: Env, deps: Deps = {}): Exports {
  const api = deps.exporter !== undefined ? deps.exporter : env.EXPORTAR ? new ContainerExport(env.EXPORTAR) : null;
  const transcriber = deps.transcriber !== undefined ? deps.transcriber : env.AI ? new WorkersAiTranscriber(env.AI) : null;
  const renderer = deps.renderer !== undefined ? deps.renderer : env.RENDER ? new ContainerRender(env.RENDER) : null;
  // O Durable Object usa os contêineres do env: com outro (os testes), os passos saem no pedido.
  const runner = deps.exporter === undefined && deps.renderer === undefined && env.EXPORTANDO ? new DurableExports(env.EXPORTANDO) : null;
  return new Exports(new Db(env.DB), env.MIDIA, api, transcriber, renderer, runner);
}

export function createStudio(env: Env, deps: Deps = {}): Studio {
  const api = deps.api !== undefined ? deps.api : env.OPENROUTER_API_KEY ? new OpenRouterVideo(env.OPENROUTER_API_KEY) : null;
  const audio = deps.audio !== undefined ? deps.audio : env.AUDIO ? new ContainerAudio(env.AUDIO) : null;
  const heygen = deps.heygen !== undefined ? deps.heygen : env.HEYGEN_API_KEY ? new HeyGenClient(env.HEYGEN_API_KEY) : null;
  // O Durable Object gera com a chave do env: com outra API (os testes), a imagem sai no pedido.
  const images = deps.images !== undefined ? deps.images : deps.api === undefined && env.IMAGENS ? new DurableImages(env.IMAGENS) : null;
  // O Fish é lido sem chave: com outra API (os testes), só o catálogo que o teste passar.
  const fish = deps.fish !== undefined ? deps.fish : deps.api === undefined ? new FishClient() : null;
  return new Studio(new Db(env.DB), env.MIDIA, api, { siteUrl: env.SITE_URL }, audio, heygen, images, fish);
}

export function createAccounts(env: Env): Accounts {
  return new Accounts(new Db(env.DB), Number(env.BCRYPT_COST) || 12);
}

export function createCosts(env: Env): CustosApi {
  const painel = env.CLOUDFLARE_ANALYTICS_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? new Painel(env.CLOUDFLARE_ANALYTICS_TOKEN, env.CLOUDFLARE_ACCOUNT_ID) : null;
  return new CustosReais(
    [
      { id: "openrouter", nome: "OpenRouter", chave: env.OPENROUTER_API_KEY, ler: (chave, doFetch) => lerOpenRouter(chave, doFetch, env.OPENROUTER_MANAGEMENT_KEY) },
      { id: "heygen", nome: "HeyGen", chave: env.HEYGEN_API_KEY, ler: lerHeyGen },
    ],
    painel,
    "meu-avatar",
  );
}

export function createMachines(env: Env): MaquinasApi {
  // No computador o contêiner não roda (wrangler dev --enable-containers=false): as três estão desligadas.
  if (env.AMBIENTE === "local") return new MaquinasReais({});
  return new MaquinasReais({
    AudioFixer: env.AUDIO && { ns: env.AUDIO, nome: "audio" },
    Exporter: env.EXPORTAR && { ns: env.EXPORTAR, nome: "exportar" },
    Renderer: env.RENDER && { ns: env.RENDER, nome: "render" },
  });
}

export function createSite(
  env: Env,
  studio: Studio,
  exports: Exports = createExports(env),
  costs: CustosApi | null = createCosts(env),
  machines: MaquinasApi | null = createMachines(env),
): Site {
  return new Site(new Db(env.DB), env.MIDIA, studio, exports, createAccounts(env), costs, machines, {
    siteUrl: env.SITE_URL,
    defaults: {
      duration: Number(env.VIDEO_DURATION),
      resolution: env.VIDEO_RESOLUTION,
      aspectRatio: env.VIDEO_ASPECT_RATIO,
    },
    local: env.AMBIENTE === "local",
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

  // Aviso da HeyGen (callback_url do pedido) de que um vídeo terminou. O corpo
  // desse aviso não tem assinatura documentada: ele só serve de gatilho, e o
  // status vem sempre da própria API.
  if (request.method === "POST" && url.pathname === "/heygen/webhook") {
    let payload: unknown = null;
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return new Response("bad request", { status: 400 });
    }
    try {
      await studio.onHeyGenWebhook(payload);
    } catch (err) {
      console.error("Erro ao processar aviso da HeyGen", err);
      return new Response("error", { status: 500 });
    }
    return new Response("ok");
  }

  return createSite(
    env,
    studio,
    createExports(env, deps),
    deps.costs !== undefined ? deps.costs : createCosts(env),
    deps.machines !== undefined ? deps.machines : createMachines(env),
  ).handle(request);
}

/** O alarme de contêiner ligado sem trabalho (src/vigia.ts): o painel da Cloudflare e o que o site sabe de cada um. */
export function vigiaConteineres(env: Env, doFetch: typeof fetch = fetch) {
  const db = new Db(env.DB);
  const parar = (ns: DurableObjectNamespace<AudioFixer | Exporter | Renderer> | undefined, nome: string) => (limiteMs: number) =>
    ns ? ns.getByName(nome).pararSeOcioso(limiteMs) : Promise.resolve("desligado" as const);
  const vigiados: Vigiado[] = [
    { classe: "AudioFixer", trabalhoNoBanco: () => db.audioWorking(), pararSeOcioso: parar(env.AUDIO, "audio") },
    { classe: "Exporter", trabalhoNoBanco: () => db.exportWorking(), pararSeOcioso: parar(env.EXPORTAR, "exportar") },
    { classe: "Renderer", trabalhoNoBanco: async () => false, pararSeOcioso: parar(env.RENDER, "render") },
  ];
  const painel = env.CLOUDFLARE_ANALYTICS_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? new Painel(env.CLOUDFLARE_ANALYTICS_TOKEN, env.CLOUDFLARE_ACCOUNT_ID, doFetch) : null;
  return () => vigiar(painel, vigiados, db);
}

export default {
  fetch: (request, env) => handle(request, env),

  // Rede de segurança: confere os vídeos que ainda estão na fila, caso o aviso se perca.
  async scheduled(controller, env): Promise<void> {
    // A cada 15 min, fora do computador: contêiner ligado sem trabalho (src/vigia.ts). Antes do
    // resto, para um erro lá adiante não calar o alarme.
    if (env.AMBIENTE !== "local" && new Date(controller.scheduledTime).getUTCMinutes() % 15 === 0) {
      await vigiaConteineres(env)().catch((err) => console.error("Alarme de contêiner falhou", err));
    }
    const studio = createStudio(env);
    // Cada etapa por si: o erro de uma (um download que falha, por exemplo) não para as seguintes.
    const etapa = (nome: string, fazer: () => Promise<unknown>) => fazer().catch((err) => console.error(`Agendamento: ${nome} falhou`, err));
    // A troca de avatar pelo Aleph 2 prepara um vídeo e o envia; depois, os da fila. Desativado, nem consulta.
    if (!ALEPH.off) await etapa("preparo", () => studio.prepareNext());
    // O HeyGen pela API direta com voz clonada: pede os vídeos cuja voz ficou pronta.
    await etapa("voz", () => studio.voiceNext());
    await etapa("conferência", () => studio.syncOpen());
    // Depois de buscar os prontos, trata o áudio de um vídeo da fila e faz uma edição rápida pedida.
    await etapa("áudio", () => studio.treatNextAudio());
    await etapa("edição", () => studio.editNext());
    // A exportação anda pela tela; o que ela deixou pela metade termina aqui.
    await etapa("exportação", () => createExports(env).next());
  },
} satisfies ExportedHandler<Env>;
