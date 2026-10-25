/**
 * Tratamento do áudio dos vídeos num contêiner da Cloudflare (container/):
 * ffmpeg + DeepFilterNet 3, a receita "E2" de container/tratar.sh. O Wan, pelo
 * OpenRouter, devolve a voz alta demais, cortada e com chiado; o contêiner
 * recupera os picos, realça a voz, suaviza agudos e põe o volume em −14 LUFS.
 *
 * O contêiner não tem acesso à internet: recebe o MP4 e devolve o MP4 tratado.
 * Fica ligado alguns minutos depois de cada vídeo e depois dorme sozinho.
 */
import { Container, getContainer } from "@cloudflare/containers";

export class AudioFixer extends Container {
  defaultPort = 8080;
  sleepAfter = "3m";
  enableInternet = false;
}

/** O que o estúdio usa do contêiner; os testes trocam por um falso. */
export interface AudioApi {
  /** Devolve o MP4 com o áudio tratado (corpo com content-length) ou lança erro. */
  treat(mp4: ReadableStream, size: number): Promise<Response>;
}

export class ContainerAudio implements AudioApi {
  constructor(private readonly ns: DurableObjectNamespace<AudioFixer>) {}

  async treat(mp4: ReadableStream, size: number): Promise<Response> {
    // Uma instância só: um vídeo por vez, na ordem em que ficaram prontos.
    const res = await getContainer(this.ns, "audio").fetch(
      new Request("http://audio/tratar", { method: "POST", body: mp4, headers: { "content-length": String(size) } }),
    );
    if (!res.ok) throw new Error(`Tratamento do áudio falhou (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
    if (!res.body || !res.headers.get("content-length")) throw new Error("Tratamento do áudio voltou sem o vídeo.");
    return res;
  }
}
