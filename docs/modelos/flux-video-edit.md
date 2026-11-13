# FLUX Video Edit (`black-forest-labs/flux-video-edit`)

Da Black Forest Labs, versão "[fast]". Edita um vídeo pronto pelo texto: tira, põe ou troca objetos e
pessoas, refaz o cenário, mexe no texto da tela; o resto do vídeo fica. Estrutura `flux.ts`
(`flux-edit`), só para o administrador (em teste), desde 13/11/2026: no site (vídeo de origem e "O que
mudar") e no agente, pelo `gerar_video {modelo: "flux-edit", video, cena}`.

O que se sabe (lista de modelos do OpenRouter e guia do modelo, `openrouter.ai/black-forest-labs/flux-video-edit/llms.txt`, lidos em 13/11/2026):

- **Pedido**: só `prompt` e o vídeo em `input_references` (`video_url`). Sem duração, resolução,
  formato, quadros, semente nem som (`generate_audio: false`). Opção do provedor: `safety_tolerance`
  (a estrutura não manda).
- **Custo**: US$ 0,03 por segundo do vídeo gerado (`cents_per_second_output: 3`). A estimativa do
  site conta os segundos do vídeo de origem: um vídeo de 6 s sai US$ 0,18. Falha não é cobrada.
- **Não documentado** (a conferir no primeiro teste real): a duração aceita no vídeo de origem (a
  estrutura aceita de 2 a 15 s, como o Seedance, provisório), o tamanho máximo, se o vídeo sai com a
  mesma duração e o mesmo quadro do original (a estrutura grava os do original) e se o som do
  original fica (a estrutura não trata o áudio nem tem a Edição rápida). O `docs.bfl.ai` não abre
  deste ambiente.

Para que serve: variações de um vídeo que já deu certo (outro produto na mão, outro cenário, outra
cor de roupa) sem gerar de novo, e o Wan 3.0 não faz isso pelo OpenRouter (só recebe imagens).

## Testes

Nenhum ainda. O primeiro teste real gasta créditos e só com o sim do dono: um vídeo de 5 a 8 s com
uma pessoa e um objeto à vista, pedindo para trocar o objeto. Anotar aqui o custo real, a duração e o
quadro do resultado, se o som ficou e se o rosto mudou.
