# Runway Aleph 2 (`runway/aleph-2`): em teste para trocar avatar

Pedido pelo OpenRouter (conferido em 28/10/2026, pelas recusas, que não
custam nada, e pelos tipos do SDK oficial, `@runwayml/sdk`):

- O vídeo vai em `input_references` como `video_url` (vira o `videoUri` da
  Runway): de 2 a 30 s e até 16 MB. A duração e o formato seguem o vídeo.
- **Não aceita foto de referência**: uma `image_url` em `input_references` vira
  `references`, que o Aleph 2 recusa (`Unrecognized key: "references"`).
- A foto entra como **quadro-chave**: `provider.options.runway.keyframes`, até
  5 itens `{ "uri": <https ou data URI até 5 MB>, "seconds": <instante> }` (ou
  `{ uri, at: <fração de 0 a 1> }`). O quadro-chave é a imagem de como o vídeo
  deve ficar naquele instante, não um retrato solto.
- Não mandar `aspect_ratio`: na Runway ele expande o quadro (outpaint).
- Preço: US$ 0,28 por segundo, mínimo de US$ 0,56.
- Cuidado ao sondar o formato: um pedido válido já gera e cobra; nas sondagens,
  mande valores que com certeza são recusados.

Da documentação oficial da Runway (docs.dev.runwayml.com, lida em 28/10/2026;
`/llms.txt` aponta o `/api.md`, a referência de cada campo por modelo):

- O Aleph 2 **mantém a resolução do vídeo de entrada, até 1080p**; o vídeo tem
  de 2 a 30 s e no máximo 30 quadros por segundo.
- `promptText` até 1000 caracteres. O guia pede prompt curto: um verbo de ação
  e a mudança e, no fim, o que fica igual.
- `keyframes`: de 1 a 5, cada um com `seconds` (de 0 a 30) ou `at` (fração);
  opcionalmente `range` (`start_seconds`, `end_seconds`) para editar só um
  trecho. A ideia do modelo: um quadro editado leva a mudança ao resto do vídeo.
- `contentModeration.publicFigureThreshold` (`auto` ou `low`) só afrouxa o
  filtro de figuras públicas.
- Na Runway direto (fora do OpenRouter) há outros modelos de vídeo para vídeo
  que aceitam **foto de referência**: Kling O3 (até 4 fotos, mantém o áudio
  original, vídeo de até 10 s e de 720 a 3840 px) e Kling 4.0 (até 10 fotos).
  Nenhum dos dois está no OpenRouter hoje.

Como foi montado o teste:

1. Primeiro quadro do vídeo (`ffmpeg -frames:v 1`).
2. Troca do rosto nesse quadro com `google/gemini-nano-banana-2.1` (chat
   completions, `modalities: ["image", "text"]`, o quadro e a foto juntos):
   US$ 0,04. O modelo trocou bem o rosto, mas mudou o tamanho e trocou as
   faixas pretas por fundo desfocado; foi preciso colar só a parte central no
   quadro original.
3. Aleph 2 com o vídeo e esse quadro em `seconds: 0`.

Resultado do teste de 28/10/2026 (job `gen-vid-1793229723-30Hv1IkTp1JqFxeMsa70`):

- **Custo real: US$ 1,40** pelo vídeo de 5,5 s (US$ 0,04 a mais pelo quadro
  trocado). Ficou pronto em uns 2 minutos. Aceitou o vídeo com pessoa real e
  o rosto realista, sem recusa.
- **Áudio: o original, intacto** (correlação 0,9999 com o vídeo de origem). A
  voz e a fala se mantêm sem nenhum passo a mais.
- Saiu em 1920×1080 (o original tinha 1280×720), com a mesma cena, os mesmos
  gestos e as mesmas faixas pretas.
- **A troca não se manteve:** no instante 0 o rosto é o do quadro-chave; meio
  segundo depois já voltou a ser o da pessoa original e segue assim até o fim.
  O quadro-chave guia só o trecho perto dele. A legenda queimada no vídeo saiu
  com letras trocadas em alguns quadros.

Segundo teste, 28/10/2026 (job pronto às 23:44): o mesmo vídeo com **5
quadros-chave** com o rosto trocado, o máximo que o Aleph 2 aceita (0; 1,35;
2,7; 4,05 e 5,0 s).

- O último quadro-chave pode ir no máximo até a duração inteira do vídeo: o
  de 5,5 s conta como 5 (`Keyframe timestamp must be at most 5`).
- **Custo real: US$ 1,40** de novo, mais US$ 0,22 pelos quadros trocados.
- Áudio original intacto outra vez (correlação 0,9999).
- **A troca ficou pela metade:** o cabelo virou o da foto (mais longo,
  ondulado, com mechas) do começo ao fim, mas o rosto ficou uma mistura das
  duas, mais perto da pessoa original. Não passa por outra pessoa.

Terceiro teste, 29/10/2026 (job pronto às 00:00), com a ideia do dono de
caprichar no rosto dos quadros-chave:

- **Vídeo vertical e maior:** as faixas pretas cortadas e a parte com conteúdo
  (406×720) aumentada para 1080×1920 (ffmpeg, `lanczos`), subida ao R2 em
  `origens/a7472747-478e-4146-bcf1-9a0b695f4c99.mp4`. O rosto passou de uns
  110 px para uns 290 px de largura.
- **Quadros-chave feitos sobre esse quadro vertical**, com a foto inteira e um
  recorte do rosto em boa resolução como referência, e um prompt que descreve
  os traços (olhos, sobrancelhas, nariz, lábios, queixo, cabelo) e manda manter
  pose, mão e boca. O modelo de imagem devolve 768 px de largura; ampliados para
  1080×1920. Um quadro que mudou o frasco de lugar foi refeito: quadro-chave que
  não bate com o movimento do vídeo pode criar defeito.
- **Prompt do Aleph curto**, como pede o guia da Runway.
- **Custo real: US$ 1,40**, mais US$ 0,26 pelos 6 quadros de imagem.
- Saiu em 1080×1920, com o áudio original intacto (correlação 0,9999).
- **Resultado: bem melhor.** Sobrancelhas grossas, olhos, nariz e o cabelo do
  avatar; passa por outra pessoa em quase todo o vídeo. Em alguns instantes,
  sorrindo, o rosto ainda puxa um pouco para o original.

**Conclusão: com o rosto bem definido nos quadros-chave, o Aleph 2 troca o
avatar.** O que pesa é a resolução do rosto, tanto no vídeo quanto nos
quadros-chave. A receita, para virar estrutura:

1. Cortar faixas pretas e levar a parte com conteúdo ao maior tamanho aceito
   (até 1080p), no formato dela.
2. Tirar 5 quadros (o último no máximo na duração inteira, em segundos
   inteiros) e trocar o rosto em cada um com a foto inteira e o recorte do
   rosto, conferindo que pose, mãos e objetos não mudaram.
3. Aleph 2 com o vídeo, os 5 quadros-chave e um prompt curto.

Custo de 5,5 s: uns US$ 1,65 no total.

**Custo:** o Aleph cobra por segundo de vídeo, qualquer que seja o número de
quadros-chave. Passar de 5 para 3 quadros economiza só uns US$ 0,08 de imagens
por vídeo; o que pesa é a duração (US$ 0,28/s).

A escolha do modelo de imagem para os quadros-chave está em
[gemini-nano-banana-2.1.md](gemini-nano-banana-2.1.md).

Quarto teste, 29/10/2026 (job pronto às 00:20): o mesmo do terceiro, com os
quadros-chave em 2K (ampliados de 1536×2752 e reduzidos a 1080×1920).

- O banana em 2K ainda muda o que não devia em alguns quadros: tirou o frasco
  da frente do rosto (0 s) e abriu os olhos de quem olhava para baixo
  (4,05 s). Refazer com a instrução explícita resolveu os olhos, não o frasco
  (o modelo evita cobrir o rosto); no de 0 s ficou o quadro de 768 px do
  terceiro teste. **Conferir cada quadro contra o original é parte da receita.**
- **Custo real: US$ 1,40** mais US$ 0,42 de imagens (7 gerações).
- Áudio original intacto (0,9999).
- **Resultado: pior que o terceiro teste.** O rosto ficou quase igual (a
  nitidez medida subiu pouco: variância do laplaciano de 13–16 para 16–18 no
  meio do vídeo) e **apareceu um erro no fundo**, visto pelo dono: uma
  prateleira da parede anda para a esquerda. Causa: o quadro-chave de 4,05 s,
  refeito em 2K, inventou uma prateleira na parede onde o original não tem; o
  Aleph seguiu o quadro. A diferença do fundo desse quadro para o original era
  a maior de todas (22,6 de média, contra 16,0 no terceiro teste).

**Conclusão: a versão que vale é a do terceiro teste** (banana pelo chat, 768
px, ampliado). Acima disso, a resolução dos quadros-chave quase não muda o
rosto, e cada geração a mais é uma chance de o modelo de imagem redesenhar o
fundo. O teto de qualidade agora é o vídeo de origem: a parte com o rosto tinha
só 406×720 e foi ampliada; um vídeo nítido, em 1080p de verdade, deve render
mais que qualquer ajuste nos quadros. **Conferir cada quadro-chave contra o
original — pose, mãos, objetos, olhos e o fundo — antes de mandar ao Aleph.**
