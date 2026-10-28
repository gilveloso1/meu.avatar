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
| `runway/aleph-2` | Trocar avatar (vídeo + quadro trocado) | Em teste, pelo terminal: com um quadro-chave só, o rosto volta ao original | — |
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

## Runway Aleph 2 (`runway/aleph-2`): em teste para trocar avatar

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

Próximo passo: o mesmo vídeo com **5 quadros-chave** espalhados (0, 1,4, 2,7,
4,1 e 5,4 s), cada um com o rosto trocado (5 × US$ 0,04 + US$ 1,40 ≈ US$ 1,60).
Se o rosto ainda voltar, o Aleph 2 não serve para trocar a pessoa inteira e o
próximo candidato é o Hailuo 3 (`minimax/hailuo-3`, foto como referência) ou o
Genjutsu pela API do Higgsfield (fora do OpenRouter; ver abaixo).

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
