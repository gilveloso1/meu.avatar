/**
 * Tratamento do áudio e edição rápida dos vídeos num contêiner da Cloudflare (container/):
 * ffmpeg + DeepFilterNet 3, a receita "E2" de container/tratar.sh. O Wan, pelo
 * OpenRouter, devolve a voz alta demais, cortada e com chiado; o contêiner
 * recupera os picos, realça a voz, suaviza agudos e põe o volume em −14 LUFS.
 *
 * A edição rápida (container/editar.py) corta os silêncios, muda o
 * enquadramento a cada corte e põe o volume em −14 LUFS.
 *
 * A troca de avatar pelo Aleph 2 (container/aleph.py) prepara o vídeo (sem
 * faixas pretas, ampliado até 1080p), tira os quadros-chave, recorta o rosto
 * da foto, põe o quadro com o rosto trocado no tamanho do vídeo e, no fim,
 * compõe o original com a cabeça do Aleph por cima.
 *
 * O contêiner não tem acesso à internet: recebe o MP4 e devolve o MP4 tratado.
 * Fica ligado alguns minutos depois de cada vídeo e depois dorme sozinho.
 */
import { getContainer } from "@cloudflare/containers";
import { SleepyContainer } from "./conteiner";
import type { containerPlan } from "./quickedit";

export type ContainerPlan = ReturnType<typeof containerPlan>;

/** Centro e altura do rosto, em frações do quadro; vazio se não achou. */
export type Face = { x: number; y: number; altura: number } | Record<string, never>;

export class AudioFixer extends SleepyContainer {
  defaultPort = 8080;
  sleepAfter = "3m";
  // O prazo do tratamento (AUDIO_TIMEOUT_MS, src/studio.ts): passado isso, o vídeo já virou falha.
  protected readonly maxRequestMs = 20 * 60_000;
  enableInternet = false;
}

/** O que o estúdio usa do contêiner; os testes trocam por um falso. */
export interface AudioApi {
  /** Devolve o MP4 com o áudio tratado (corpo com content-length) ou lança erro. */
  treat(mp4: ReadableStream, size: number): Promise<Response>;
  /** Devolve o MP4 com a edição rápida (corpo com content-length) ou lança erro. */
  edit(mp4: ReadableStream, size: number, plan: ContainerPlan): Promise<Response>;
  /** Onde está o rosto no vídeo (container/rosto.py). O MP4 vai inteiro: dá para tentar de novo. */
  face(mp4: ArrayBuffer): Promise<Face>;
  /** O vídeo sem faixas pretas e ampliado para o Aleph 2 (corpo com content-length). */
  prepare(mp4: ReadableStream, size: number): Promise<Response>;
  /** Os quadros nesses instantes (s), em JPEG base64. */
  frames(mp4: ArrayBuffer, seconds: number[]): Promise<string[]>;
  /** O rosto da foto, recortado com folga, em JPEG base64; null sem rosto. */
  faceCrop(image: ArrayBuffer): Promise<string | null>;
  /** A imagem (base64) no tamanho exato do vídeo, em JPEG base64. */
  resize(image: string, width: number, height: number): Promise<string>;
  /**
   * O vídeo preparado com a cabeça e o cabelo do Aleph por cima. Os dois vão
   * emendados em `body`; `firstSize` é quantos bytes são do preparado.
   */
  compose(body: ReadableStream, size: number, firstSize: number): Promise<Response>;
}

/**
 * Quanto esperar o contêiner subir. A biblioteca espera 8 s pela instância e
 * 20 s pela porta; na primeira partida depois de um deploy, a máquina ainda
 * baixa a imagem (~820 MB, com o OpenCV) e isso não basta: a chamada voltava
 * com erro antes de mandar o vídeo.
 */
const START_TIMEOUT_MS = 120_000;

export class ContainerAudio implements AudioApi {
  constructor(private readonly ns: DurableObjectNamespace<AudioFixer>) {}

  /** O contêiner (uma instância só), já de pé e com a porta respondendo. */
  private async ready() {
    const container = getContainer(this.ns, "audio");
    await container.startAndWaitForPorts({ ports: 8080, cancellationOptions: { instanceGetTimeoutMS: START_TIMEOUT_MS, portReadyTimeoutMS: START_TIMEOUT_MS } });
    return container;
  }

  treat(mp4: ReadableStream, size: number): Promise<Response> {
    return this.post("/tratar", "Tratamento do áudio", mp4, size);
  }

  edit(mp4: ReadableStream, size: number, plan: ContainerPlan): Promise<Response> {
    return this.post("/editar", "Edição rápida", mp4, size, { "x-plano": JSON.stringify(plan) });
  }

  async face(mp4: ArrayBuffer): Promise<Face> {
    // Uma segunda tentativa: a primeira pode pegar o contêiner ainda subindo.
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await (await this.ready()).fetch(new Request("http://audio/rosto", { method: "POST", body: mp4 }));
        if (!res.ok) throw new Error(`Detecção do rosto falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
        return (await res.json()) as Face;
      } catch (err) {
        if (attempt >= 2) throw err;
        console.error("Detecção do rosto: tentando de novo", err);
      }
    }
  }

  prepare(mp4: ReadableStream, size: number): Promise<Response> {
    return this.post("/preparar", "Preparo do vídeo", mp4, size);
  }

  compose(body: ReadableStream, size: number, firstSize: number): Promise<Response> {
    return this.post("/compor", "Composição", body, size, { "x-primeiro": String(firstSize) });
  }

  async frames(mp4: ArrayBuffer, seconds: number[]): Promise<string[]> {
    return ((await this.json("/quadros", "Quadros-chave", mp4, { "x-instantes": seconds.join(",") })) as { quadros: string[] }).quadros;
  }

  async faceCrop(image: ArrayBuffer): Promise<string | null> {
    return ((await this.json("/recorte", "Recorte do rosto", image)) as { imagem?: string }).imagem ?? null;
  }

  async resize(image: string, width: number, height: number): Promise<string> {
    const body = new TextEncoder().encode(JSON.stringify({ imagem: image, largura: width, altura: height }));
    return ((await this.json("/ajustar", "Ajuste do quadro", body.buffer as ArrayBuffer)) as { imagem: string }).imagem;
  }

  /** Corpo inteiro e resposta em JSON (os comandos leves). */
  private async json(path: string, what: string, body: ArrayBuffer, headers: Record<string, string> = {}): Promise<unknown> {
    const res = await (await this.ready()).fetch(new Request(`http://audio${path}`, { method: "POST", body, headers }));
    if (!res.ok) throw new Error(`${what} falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
    return res.json();
  }

  private async post(path: string, what: string, mp4: ReadableStream, size: number, headers: Record<string, string> = {}): Promise<Response> {
    // Uma instância só: um vídeo por vez, na ordem em que ficaram prontos.
    const res = await (await this.ready()).fetch(
      new Request(`http://audio${path}`, { method: "POST", body: mp4, headers: { "content-length": String(size), ...headers } }),
    );
    if (!res.ok) throw new Error(`${what} falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
    if (!res.body || !res.headers.get("content-length")) {
      // Corpo sem ler deixa o pedido aberto no contêiner, e ele não dorme.
      await res.body?.cancel();
      throw new Error(`${what} voltou sem o vídeo.`);
    }
    return res;
  }
}
