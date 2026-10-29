# Modelos: o que está sendo testado

Registro de todo modelo que o meu.avatar usa ou já testou: para que serve, o
estado, o que se viu e quanto custou. **Antes de escolher ou montar um modelo,
leia aqui.** Depois de cada teste (bom ou ruim), atualize no mesmo PR.

Estados:

- **No ar**: liberado para todos (`access: "all"`).
- **Em teste**: estrutura no ar só para o administrador (`access: "admin"`), ou
  teste feito pelo terminal, sem estrutura.
- **Bloqueado**: o provedor recusa o uso pretendido. A estrutura fica como
  está (pode servir a outro uso); o motivo e a prova ficam aqui.
- **Descartado**: testado e não serve; a estrutura sai.

Como registrar um teste: data, o que foi pedido (vídeo, foto, ajustes), o
resultado (com a mensagem do provedor, se falhou), o custo real e o próximo
passo. Vídeos de teste não vão para o repositório; diga onde estão (id no D1 ou
caminho no R2).

## Resumo

| Modelo (id no OpenRouter) | Uso | Estado | Estrutura |
|---|---|---|---|
| `alibaba/wan-3.0` | Avatar falando, a partir da foto e da fala | No ar | `wan.ts` |
| `heygen/avatar-iv` | Avatar falando, voz pronta da HeyGen | Em teste | `heygen.ts` |
| `bytedance/seedance-2.0` | Trocar avatar (vídeo + foto) | **Bloqueado** para vídeo com rosto realista | `seedance.ts` |
| `runway/aleph-2` | Trocar avatar (vídeo + 5 quadros com o rosto trocado) | Em teste, pelo terminal: troca o avatar quando o rosto está grande e nítido; mantém o áudio | — |
| `google/gemini-nano-banana-2.1` | Trocar o rosto no primeiro quadro (ajuda o Aleph 2) | Em teste, pelo terminal | — |

## Wan 3.0 (`alibaba/wan-3.0`)

No ar desde o começo. A voz sai alta e com chiado pelo OpenRouter; o contêiner
trata o áudio. Medições em `docs/prompt.md` e `docs/backlog.md`.

## HeyGen Avatar IV (`heygen/avatar-iv`)

Em teste desde 25/10/2026: voz de texto para fala, sem o chiado do Wan.
Próximos passos no item 1 de `docs/backlog.md`.

## Seedance 2.0 (`bytedance/seedance-2.0`): bloqueado para trocar avatar

- **28/10/2026, Trocar avatar:** vídeo de 5,5 s (1280×720, uma pessoa real
  filmada) e uma foto de avatar realista, 480p. O OpenRouter respondeu HTTP 400
  na hora do envio, sem criar job (sem custo):
  `InputVideoSensitiveContentDetected.PrivacyInformation` ("the input video may
  contain real person"). Vídeo `b46cf527-948f-41b3-8a5e-ed7da5354211` no D1.
- **Por quê:** desde fev/2026 a ByteDance recusa no Seedance 2.0 e 2.5 fotos e
  vídeos de referência com rosto que pareça real, inclusive rosto sintético
  realista. Mandar de novo dá o mesmo erro. A exceção é o rosto autorizado na
  própria BytePlus (convite, verificação de identidade, um id de "ativo"), que
  o OpenRouter não repassa: das opções da BytePlus, só `watermark` e `req_key`.
- **Não contornar** o filtro (cortar, borrar, disfarçar o rosto): é regra do
  provedor.
- **A estrutura fica como está**, com o campo Uso: o Seedance pode servir a
  outros usos sem rosto realista na entrada (cenário, objeto, personagem
  estilizado). Um uso novo é uma opção nova em `USES`.

## Runway Aleph 2 (`runway/aleph-2`): em teste para trocar avatar (promissor)

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

**Modelo de imagem para os quadros-chave** (29/10/2026, o mesmo quadro de
2,7 s, as mesmas referências e o mesmo prompt, em 2K e 9:16, pela API de
imagens do OpenRouter, `POST /api/v1/images` com `resolution` e
`aspect_ratio`; pelo chat, o banana devolvia só 768 px de largura):

| Modelo | Saída | Custo | Tempo | Resultado |
|---|---|---|---|---|
| `google/gemini-nano-banana-2.1` | 1536×2752 | US$ 0,06 | 21 s | **O melhor:** rosto do avatar, nítido, e o resto do quadro igual |
| `google/gemini-3-pro-image` | 768×1376 (ignorou o 2K) | US$ 0,14 | 31 s | Rosto bom, mas sem ganho de resolução e mais caro |
| `black-forest-labs/flux-3-image` | 1536×2736 | US$ 0,10 | 90 s | Nítido, mas o rosto foge do avatar |
| `qwen/qwen-image-3-pro` | 1152×2048 | US$ 0,08 | 134 s | Mudou a mão, o enquadramento, o cabelo e a luz: não serve como quadro-chave |

Escolhido: **`gemini-nano-banana-2.1` em 2K pela API de imagens** (5 quadros ≈
US$ 0,30). Falta um teste do Aleph com esses quadros para ver se o rosto fica
ainda mais firme.

## Fora do OpenRouter: Higgsfield Genjutsu (não testado)

Pesquisado em 28/10/2026, sem teste. É o que o dono usou no Higgsfield para
trocar o avatar com sucesso. Motion Transfer (troca personagem ou cenário
mantendo o movimento) e Object Swap; vídeo de 4 a 30 s e até 30 fotos de
referência; aceita vídeo filmado. O modelo por trás não é público. API paga por
uso em open.higgsfield.ai: de US$ 0,318/s (480p) a US$ 1,632/s (1080p), com
50% de desconto anunciado em outubro (conferir). Pela assinatura do site, um
clipe de 15 s em 720p sai uns 104 créditos (≈ US$ 5,20), metade do preço
cheio da API. Usar exigiria uma chave do Higgsfield e sair da regra de que os
vídeos vêm do OpenRouter: decisão do dono.
