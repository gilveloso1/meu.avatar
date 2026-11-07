/**
 * A imagem do Nano Banana (src/structures/imagem.ts) é feita fora do pedido de quem a pediu.
 * O OpenRouter leva de 30 s a 1,5 min para responder, e o Worker para junto quando o navegador
 * sai da página ou reenvia: a imagem ficava "Gerando" até o agendamento dar falha (5 min). Aqui
 * cada imagem tem um Durable Object, que guarda o id e roda pelo alarme (até 15 min, sem
 * depender de conexão nenhuma). O pedido só registra e volta; a página atualiza sozinha.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { createStudio } from "./index";

/** Quem faz a imagem fora do pedido (os testes rodam no próprio pedido, sem ele). */
export interface ImageRunner {
  start(videoId: string): Promise<void>;
}

export class ImageMaker extends DurableObject<Env> {
  async start(videoId: string): Promise<void> {
    await this.ctx.storage.put("video", videoId);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    const id = await this.ctx.storage.get<string>("video");
    // Apaga antes de pedir: se o alarme cair no meio e for repetido, não se paga a imagem duas
    // vezes; a linha vira falha pelo agendamento (failStaleImages).
    await this.ctx.storage.deleteAll();
    if (id) await createStudio(this.env).finishImage(id);
  }
}

/** Um Durable Object por imagem: várias saem ao mesmo tempo. */
export class DurableImages implements ImageRunner {
  constructor(private readonly ns: DurableObjectNamespace<ImageMaker>) {}

  start(videoId: string): Promise<void> {
    return this.ns.get(this.ns.idFromName(videoId)).start(videoId);
  }
}
