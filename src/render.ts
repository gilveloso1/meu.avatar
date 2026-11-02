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

/** O que o site usa do contêiner; os testes trocam por um falso. */
export interface RenderApi {
  /** Devolve o WebM (corpo com content-length) ou lança RenderError. */
  render(html: string, largura: number, altura: number, duracao: number): Promise<Response>;
}

export class ContainerRender implements RenderApi {
  constructor(private readonly ns: DurableObjectNamespace<Renderer>) {}

  /** O HTML vai inteiro em cada tentativa: a conexão que cai no meio é refeita do começo. */
  render(html: string, largura: number, altura: number, duracao: number): Promise<Response> {
    return tentando("Render", () => this.once(html, largura, altura, duracao), (err) => err instanceof RenderError);
  }

  private async once(html: string, largura: number, altura: number, duracao: number): Promise<Response> {
    const container = await ligado(this.ns, "render", START_TIMEOUT_MS);
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
