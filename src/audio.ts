/**
 * Tratamento do áudio e edição rápida dos vídeos num contêiner da Cloudflare (container/):
 * ffmpeg + DeepFilterNet 3, a receita "E2" de container/tratar.sh. O Wan, pelo
 * OpenRouter, devolve a voz alta demais, cortada e com chiado; o contêiner
 * recupera os picos, realça a voz, suaviza agudos e põe o volume em −14 LUFS.
 *
 * A edição rápida (container/editar.py) corta os silêncios, muda o
 * enquadramento a cada corte e põe o volume em −14 LUFS.
 *
 * O contêiner não tem acesso à internet: recebe o MP4 e devolve o MP4 tratado.
 * Fica ligado alguns minutos depois de cada vídeo e depois dorme sozinho.
 */
import { Container, getContainer } from "@cloudflare/containers";
import type { containerPlan } from "./quickedit";

export type ContainerPlan = ReturnType<typeof containerPlan>;

export class AudioFixer extends Container {
  defaultPort = 8080;
  sleepAfter = "3m";
  enableInternet = false;
}

/** O que o estúdio usa do contêiner; os testes trocam por um falso. */
export interface AudioApi {
  /** Devolve o MP4 com o áudio tratado (corpo com content-length) ou lança erro. */
  treat(mp4: ReadableStream, size: number): Promise<Response>;
  /** Devolve o MP4 com a edição rápida (corpo com content-length) ou lança erro. */
  edit(mp4: ReadableStream, size: number, plan: ContainerPlan): Promise<Response>;
}

export class ContainerAudio implements AudioApi {
  constructor(private readonly ns: DurableObjectNamespace<AudioFixer>) {}

  treat(mp4: ReadableStream, size: number): Promise<Response> {
    return this.post("/tratar", "Tratamento do áudio", mp4, size);
  }

  edit(mp4: ReadableStream, size: number, plan: ContainerPlan): Promise<Response> {
    return this.post("/editar", "Edição rápida", mp4, size, { "x-plano": JSON.stringify(plan) });
  }

  private async post(path: string, what: string, mp4: ReadableStream, size: number, headers: Record<string, string> = {}): Promise<Response> {
    // Uma instância só: um vídeo por vez, na ordem em que ficaram prontos.
    const res = await getContainer(this.ns, "audio").fetch(
      new Request(`http://audio${path}`, { method: "POST", body: mp4, headers: { "content-length": String(size), ...headers } }),
    );
    if (!res.ok) throw new Error(`${what} falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
    if (!res.body || !res.headers.get("content-length")) throw new Error(`${what} voltou sem o vídeo.`);
    return res;
  }
}
