/**
 * Composição em HTML para vídeo transparente (docs/api.md): o agente escreve elementos,
 * <style> e <script> com a linha do tempo `tl` do GSAP, e o contêiner de render
 * (container/render/servidor.mjs) faz o WebM com o HyperFrames. O WebM entra no projeto
 * como arquivo e cobre o vídeo como qualquer cobertura.
 *
 * Contêiner próprio, não o da exportação: a imagem leva o Chrome (uns 460 MB contra 118 MB),
 * e a exportação continua leve para ligar.
 */
import { ligado, SleepyContainer, tentando } from "./conteiner";

/** As fontes da imagem de render (container/render/servidor.mjs, FAMILIAS), pelo nome do CSS. */
export const FONTES = ["TikTok Sans", "Inter", "Montserrat", "Roboto", "Open Sans", "Oswald", "Playfair Display", "Poppins", "Anton", "Bebas Neue", "Archivo Black", "Courier Prime", "Pacifico"];
export const MAX_HTML_BYTES = 1024 * 1024;
export const MAX_RENDER_SECONDS = 60;
/** 60 s de vídeo levam uns 90 s; a folga cobre a fila de um render por vez. */
const RENDER_MS = 6 * 60_000;
/** A primeira partida depois de publicar ainda baixa a imagem. */
const START_TIMEOUT_MS = 180_000;

export class Renderer extends SleepyContainer {
  defaultPort = 8080;
  // Curto: ligado, o standard-3 paga memória e disco mesmo sem trabalho.
  sleepAfter = "30s";
  protected readonly maxRequestMs = RENDER_MS;
  enableInternet = false;
}

/** O HTML não virou vídeo: o motivo é o log do HyperFrames, que o agente lê para corrigir. */
export class RenderError extends Error {}

/**
 * A inspeção de uma animação (container/render/inspecionar.mjs): problemas, o que muda em cada
 * instante e os tweens da linha do tempo, em texto curto; o mosaico (JPG em base64) só se pedido.
 */
export interface InspecaoDaAnimacao {
  largura: number;
  altura: number;
  duracao: { bloco: number; animacao: number };
  problemas: { tipo: string; alvo: string; t: number[]; detalhe: string }[];
  instantes: { t: number; elementos?: string[]; mudou?: string[]; saiu?: string[]; mais?: number }[];
  linhaDoTempo: string[];
  quadros?: string;
}

/** A cena da maquete não vale: cada erro diz o campo e o que usar (cena3d/cena.js, validarCena). */
export class CenaInvalidaError extends Error {
  constructor(readonly erros: string[]) {
    super(erros.join("\n"));
  }
}

/** Onde cada pessoa e objeto caiu no quadro, em % (container/render/cena3d/cena.js). */
export interface RelatorioDaMaquete {
  lente: number;
  campo_vertical: number;
  itens: Record<string, unknown>[];
  avisos?: string[];
}

/** O tamanho máximo do JSON de uma cena (o mesmo limite do HTML no contêiner). */
export const MAX_CENA_BYTES = 1024 * 1024;

/** O que o site usa do contêiner; os testes trocam por um falso. */
export interface RenderApi {
  /** A foto (PNG) da maquete 3D; lança CenaInvalidaError ou RenderError. */
  maquete(cena: unknown, largura: number, altura: number): Promise<{ png: Uint8Array; relatorio: RelatorioDaMaquete }>;
  /** Devolve o WebM (corpo com content-length) ou lança RenderError. */
  render(html: string, largura: number, altura: number, duracao: number): Promise<Response>;
  /** Abre o HTML no Chrome sem fazer vídeo e mede cada instante; lança RenderError se a página não abre. */
  inspect(html: string, largura: number, altura: number, duracao: number, instantes: number[], quadros: boolean): Promise<InspecaoDaAnimacao>;
}

export class ContainerRender implements RenderApi {
  /** url: no computador (RENDER_URL), o servidor do contêiner rodando fora dele, sem Docker. */
  constructor(
    private readonly ns: DurableObjectNamespace<Renderer> | null,
    private readonly url: string | null = null,
  ) {}

  private async conectar(): Promise<{ fetch(req: Request): Promise<Response> }> {
    if (this.url) {
      const base = this.url.replace(/\/$/, "");
      return { fetch: (req: Request) => fetch(new Request(base + new URL(req.url).pathname, req)) };
    }
    return ligado(this.ns!, "render", START_TIMEOUT_MS);
  }

  maquete(cena: unknown, largura: number, altura: number): Promise<{ png: Uint8Array; relatorio: RelatorioDaMaquete }> {
    return tentando(
      "Maquete",
      async () => {
        const container = await this.conectar();
        const res = await container.fetch(
          new Request("http://render/maquete", { method: "POST", body: JSON.stringify(cena), headers: { "content-type": "application/json", "x-largura": String(largura), "x-altura": String(altura) } }),
        );
        if (res.status === 422) throw new CenaInvalidaError((await res.json<{ erros: string[] }>()).erros);
        if (res.status === 500) throw new RenderError((await res.text()).slice(-2000));
        if (!res.ok) throw new Error(`Maquete falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
        const r = await res.json<{ png: string; relatorio: RelatorioDaMaquete }>();
        return { png: Uint8Array.from(atob(r.png), (c) => c.charCodeAt(0)), relatorio: r.relatorio };
      },
      (err) => err instanceof RenderError || err instanceof CenaInvalidaError,
    );
  }

  /** O HTML vai inteiro em cada tentativa: a conexão que cai no meio é refeita do começo. */
  render(html: string, largura: number, altura: number, duracao: number): Promise<Response> {
    return tentando("Render", () => this.once(html, largura, altura, duracao), (err) => err instanceof RenderError);
  }

  inspect(html: string, largura: number, altura: number, duracao: number, instantes: number[], quadros: boolean): Promise<InspecaoDaAnimacao> {
    return tentando(
      "Inspeção da animação",
      async () => {
        const container = await this.conectar();
        const res = await container.fetch(
          new Request("http://render/inspecionar", {
            method: "POST",
            body: html,
            headers: { "content-type": "text/html; charset=utf-8", "x-largura": String(largura), "x-altura": String(altura), "x-duracao": String(duracao), "x-instantes": instantes.join(","), "x-quadros": quadros ? "1" : "0" },
          }),
        );
        if (res.status === 500) throw new RenderError((await res.text()).slice(-2000));
        if (!res.ok) throw new Error(`Inspeção falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
        return res.json<InspecaoDaAnimacao>();
      },
      (err) => err instanceof RenderError,
    );
  }

  private async once(html: string, largura: number, altura: number, duracao: number): Promise<Response> {
    const container = await this.conectar();
    const res = await container.fetch(
      new Request("http://render/render", { method: "POST", body: html, headers: { "content-type": "text/html; charset=utf-8", "x-largura": String(largura), "x-altura": String(altura), "x-duracao": String(duracao) } }),
    );
    if (res.status === 500) throw new RenderError((await res.text()).slice(-2000));
    if (!res.ok) throw new Error(`Render falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
    if (!res.body || !res.headers.get("content-length")) {
      // Corpo sem ler deixa o pedido aberto no contêiner, e ele não dorme.
      await res.body?.cancel();
      throw new Error("Render voltou sem o arquivo.");
    }
    return res;
  }
}
