// CLI: gera um vídeo com avatar falando e salva o MP4 em saida/.
//
//   npm run gerar -- --prompt-arquivo prompts/teste.txt --imagem avatar.jpg --simular
//   npm run gerar -- --prompt-arquivo prompts/teste.txt --imagem avatar.jpg

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { estimateCost, imageUrl, OpenRouterVideo, validate, type VideoRequest } from "./openrouter.ts"

const AJUDA = `Uso: npm run gerar -- (--prompt "..." | --prompt-arquivo arquivo.txt) [opções]

  --imagem <arquivo|url>   foto do avatar usada como primeiro quadro
  --modelo <id>            padrão: alibaba/wan-3.0
  --duracao <s>            padrão: 25
  --resolucao <r>          padrão: 480p
  --formato <a:b>          padrão: 9:16
  --seed <n>
  --sem-audio              não gera áudio
  --saida <pasta>          padrão: saida
  --simular                mostra o pedido e o custo, sem gastar créditos`

const { values: opts } = parseArgs({
  options: {
    prompt: { type: "string" },
    "prompt-arquivo": { type: "string" },
    imagem: { type: "string" },
    modelo: { type: "string", default: "alibaba/wan-3.0" },
    duracao: { type: "string", default: "25" },
    resolucao: { type: "string", default: "480p" },
    formato: { type: "string", default: "9:16" },
    seed: { type: "string" },
    "sem-audio": { type: "boolean", default: false },
    saida: { type: "string", default: "saida" },
    simular: { type: "boolean", default: false },
    ajuda: { type: "boolean", short: "h", default: false },
  },
})

function sair(mensagem: string): never {
  console.error(mensagem)
  process.exit(1)
}

if (opts.ajuda) {
  console.log(AJUDA)
  process.exit(0)
}

const prompt = (opts.prompt ?? (opts["prompt-arquivo"] ? await readFile(opts["prompt-arquivo"], "utf8") : "")).trim()
if (!prompt) sair(`Informe --prompt ou --prompt-arquivo.\n\n${AJUDA}`)

const pedido: VideoRequest = {
  model: opts.modelo,
  prompt,
  duration: Number(opts.duracao),
  resolution: opts.resolucao,
  aspect_ratio: opts.formato,
  generate_audio: !opts["sem-audio"],
  ...(opts.seed !== undefined && { seed: Number(opts.seed) }),
  ...(opts.imagem && {
    frame_images: [{ type: "image_url", image_url: { url: await imageUrl(opts.imagem) }, frame_type: "first_frame" }],
  }),
}

const modelo = await OpenRouterVideo.getModel(pedido.model)
const erros = validate(modelo, pedido)
if (erros.length) sair(`Parâmetros não suportados por ${modelo.id}: ${erros.join("; ")}`)

console.log(`Modelo: ${modelo.id} | ${pedido.duration}s | ${pedido.resolution} | ${pedido.aspect_ratio}`)
const custo = estimateCost(modelo, pedido)
if (custo !== undefined) console.log(`Custo estimado: US$ ${custo.toFixed(2)}`)

// Versão do pedido para log, sem o base64 da imagem.
const pedidoVisivel = {
  ...pedido,
  frame_images: pedido.frame_images?.map((f) => ({
    ...f,
    image_url: { url: f.image_url.url.startsWith("data:") ? `${f.image_url.url.slice(0, 40)}...(base64)` : f.image_url.url },
  })),
}

if (opts.simular) {
  console.log(JSON.stringify(pedidoVisivel, null, 2))
  process.exit(0)
}

const chave = process.env.OPENROUTER_API_KEY
if (!chave) sair("Defina a variável OPENROUTER_API_KEY.")

const cliente = new OpenRouterVideo(chave)
const enviado = await cliente.submit(pedido)
console.log(`Job enviado: ${enviado.id}`)

const concluido = await cliente.waitFor(enviado, {
  onStatus: (job) => console.log(`[${new Date().toLocaleTimeString("pt-BR")}] status: ${job.status}`),
})

const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15)
const destino = join(opts.saida, `video_${carimbo}.mp4`)
await mkdir(opts.saida, { recursive: true })
await writeFile(destino, await cliente.download(concluido))
await writeFile(destino.replace(/\.mp4$/, ".json"), JSON.stringify({ pedido: pedidoVisivel, job: concluido }, null, 2))

console.log(`Vídeo salvo em ${destino}`)
if (concluido.usage?.cost !== undefined) console.log(`Custo real: US$ ${concluido.usage.cost}`)
