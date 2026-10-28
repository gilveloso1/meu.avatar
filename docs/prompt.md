# Prompt dos vídeos

Como escrever o prompt para o Wan 3.0 e o que o estúdio acrescenta sozinho.
Pesquisa de 25/10/2026, depois do primeiro vídeo sair com o áudio agudo e
estourado.

## O formulário e o prompt montado (src/prompt.ts)

O formulário separa o que vai no prompt:

| Campo | O que vira no prompt |
|---|---|
| **Estilo** (lista) | Uma direção pronta, em inglês: câmera, enquadramento, postura (`STYLES`) |
| **Fala** | `The person on camera says softly, in a calm, low voice: "<fala>"`, numa linha só; as aspas são postas pelo estúdio |
| **Instruções extras** (opcional) | Uma linha a mais logo depois da direção do estilo |
| **Idioma da fala** | O idioma citado na orientação de qualidade (`LANGUAGES`) |

O prompt final fica nesta ordem: estilo, instruções extras, fala e, no fim, a
orientação fixa de qualidade (`qualityGuide`, ~90 palavras): uma voz só, baixa
e suave, gravada de perto num microfone de lapela em sala silenciosa e
mixada baixo; fala gentil, sem levantar a voz, no tom real da pessoa, ritmo
calmo, sibilantes suaves; sem música, efeitos, eco, distorção ou clipping; "Lip sync"; a fala no
idioma escolhido, com exatamente as palavras entre aspas; vídeo fotorrealista,
enquadramento firme e sem texto, legenda ou marca d'água na tela.

Estilos de agora: **Selfie para a câmera** (o padrão), **Apresentador** e
**Review de produto (UGC)**. Para mudar ou criar um, edite `STYLES`; os testes
conferem que cada direção fica em até 60 palavras.

O banco guarda a fala (`prompt`), o estilo, o idioma, as instruções e o prompt
exatamente como foi para o modelo (`request_prompt`), para comparar resultados
quando um estilo ou a orientação mudar.

## Volume da voz: as medições

Pelo OpenRouter, o Wan 3.0 devolve a voz alta demais e cortada; o mesmo tipo
de pedido no Higgsfield (que também usa o Wan 3.0: os arquivos têm o mesmo
selo de produtor e o mesmo codificador, sem tratamento depois) saiu no padrão.

| Vídeo | Clipping | Loudness | Pico | Acima de 3 kHz |
|---|---|---|---|---|
| 1º, prompt livre | 8,8% | −5,2 LUFS | +2,5 dBFS | 8,4% |
| 2º, estilo + "moderate volume" | 4,8% | −6,5 LUFS | +1,9 dBFS | 8,8% |
| Higgsfield, prompt livre | 0,15% | −13,8 LUFS | −0,3 dBFS | 1,7% |

Pedir voz baixa no prompt não resolveu: o 3º e o 4º vídeos, já com isso,
saíram com 11,8% e 6,5% de clipping e −4,8 e −6,2 LUFS. Por isso todo vídeo
passa pelo tratamento de áudio no contêiner (ver docs/operacao.md). O prompt
continua pedindo voz baixa, por não custar nada.

A voz baixa é pedida duas vezes: no verbo da fala (`says softly, in
a calm, low voice`) e na orientação de áudio (`soft-spoken voice at low
volume … never raising the voice`). Os estilos também evitam palavras que
puxam a voz para cima ("enthusiasm" virou "warm, genuine interest"). Se ainda
assim sair alto, o próximo passo é normalizar o áudio depois de gerar
(−14 LUFS, pico abaixo de −1 dBFS).

## Como escrever a fala

- **Só o que a pessoa fala**, sem aspas e sem instruções no meio: tudo o que
  estiver no campo é falado.
- **Tamanho:** uns 2,2 a 2,6 palavras por segundo (55 a 65 palavras em 25 s).
  O contador do formulário avisa quando passa. Fala longa demais sai corrida
  e mais aguda.
- **Escreva como se fala** e confira a gramática: o modelo fala exatamente o
  texto ("começa às cinco", não "começa cinco").
- **Instruções extras curtas e afirmativas:** "câmera parada" funciona melhor
  que "sem movimento", e caixa alta não ajuda.

## O que não dá para configurar

No OpenRouter, o Wan 3.0 não aceita parâmetros do provedor
(`allowed_passthrough_parameters` vazio): não há controle de áudio, de prompt
negativo nem do `prompt_extend` (a reescrita automática do prompt que a API da
Alibaba faz). Tudo passa pelo texto do prompt.

O Wan 3.0 aceita áudio de referência para a voz ("voice timbre reference" no
guia oficial), mas no OpenRouter as referências de áudio só valem, por ora,
para o Seedance 2 em diante. Se o prompt não bastar, os caminhos são: voz
gerada à parte e um modelo de avatar falante (HeyGen Avatar IV, no OpenRouter)
ou o Seedance com áudio de referência.

## HeyGen Avatar IV (src/structures/heygen.ts)

Estrutura em teste (só o administrador vê). A voz não sai do modelo de vídeo:
a HeyGen lê o texto com uma voz pronta e anima a foto sincronizando a boca.
O pedido pelo OpenRouter (conferido em 25/10/2026):

| Campo do formulário | No pedido |
|---|---|
| **Fala** | `prompt` (o texto que a voz lê; a duração do vídeo segue a fala) |
| **Foto** (obrigatória) | `input_references` |
| **Voz** | `provider.options.heygen.voice_id` |
| **Expressividade** (baixa, média, alta) | `provider.options.heygen.expressiveness` (`low`, `medium`, `high`; a HeyGen usa `low` se nada vier) |
| **Movimento** (opcional) | entra no fim de `provider.options.heygen.motion_prompt` |

O prompt de sistema desta estrutura é a orientação de movimento
(`MOTION_GUIDE`): olhar fixo na câmera, cabeça e piscadas naturais, ombros
relaxados e gestos contidos, o mesmo jeito do estilo "Selfie" do Wan.

**Vozes:** o OpenRouter não publica a lista. Sem `voice_id`, ele recusa o
pedido (sem custo) e mostra 12 vozes; o formulário usa as de inglês, espanhol e
as duas multilíngues (Kore, feminina, e Orus, masculina), que são as que falam
português. A lista completa da HeyGen pede uma chave da própria HeyGen.

**Áudio:** o vídeo pronto não passa pelo contêiner (`treatAudio: false`), porque
a voz vem pronta do texto para fala. Se a medição mostrar problema, é só ligar.

## Trocar avatar, Seedance 2.0 (src/structures/seedance.ts)

Estrutura em teste (só o administrador vê). Recebe um vídeo pronto e a foto de
outra pessoa e devolve o mesmo vídeo com a pessoa da foto no lugar. O pedido
pelo OpenRouter (conferido em 28/10/2026, na referência de
`POST /api/v1/videos`):

| Campo do formulário | No pedido |
|---|---|
| **Vídeo de origem** (MP4 ou MOV, de 2 a 15 s, até 50 MB) | `input_references` com `type: "video_url"` (só o Seedance 2 em diante usa referência de vídeo) |
| **Foto do avatar** (obrigatória) | `input_references` com `type: "image_url"` |
| **Roupa** (do vídeo ou da foto) | uma frase do prompt |
| **Instruções extras** (opcional) | no fim do prompt |
| **Resolução** e **Formato** | `resolution` e `aspect_ratio` |

A duração não é escolhida: o Worker lê a do vídeo enviado (caixa `mvhd` do MP4,
`src/mp4.ts`) e pede a duração aceita mais perto (4 a 15 s). O prompt de
sistema (`swapPrompt`) chama o vídeo de "video 1" e a foto de "image 1", pede
o rosto, o cabelo e o corpo da foto e mantém o resto do vídeo: cena, câmera,
gestos, expressões, tempo e a mesma fala, com a boca sincronizada.

**Áudio:** no primeiro teste, é o que o modelo gerar (`generate_audio: true`), e
não passa pelo contêiner. Se a voz não for a do vídeo de origem, o próximo passo
é o contêiner pôr de volta o áudio original.

**Custo:** o Seedance cobra por tokens de vídeo, (altura × largura × segundos
× 24) / 1024, com um preço menor quando há vídeo na entrada
(`video_tokens_with_video_input`, e o de 1080p e de 4K). A estimativa conta os
segundos do vídeo enviado junto com os do gerado (720p 9:16 ≈ US$ 0,19/s). O
custo real vem do OpenRouter quando o vídeo fica pronto: conferir no primeiro
teste se a conta bate.

## O que o Higgsfield faz

Nos repositórios públicos (`higgsfield-ai/skills`):

- Prompts de vídeo em inglês; só a fala no idioma escolhido
  (`higgsfield-video-explainer/references/prompts.md`).
- Prompt em blocos: estilo fixo repetido em todo clipe, cena, `AUDIO:` e
  `NEGATIVE:`.
- No explainer narrado, a voz nem sai do modelo de vídeo: é gerada à parte
  (Seed Audio) e juntada depois; os clipes têm só som ambiente.
- Fala de 20 a 24 palavras por clipe de 8 a 9 s.
- Prompts de até ~200 tokens, com o que se quer dito de forma positiva
  (`higgsfield-generate/references/prompt-engineering.md`).
- O Marketing Studio deles melhora o prompt no servidor, sem expor como.

## Fontes

- Guia oficial de prompt do Wan 3.0 (Alibaba Cloud Model Studio):
  <https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-prompt-guide>
- Runware, "Prompting Wan 3.0":
  <https://runware.ai/docs/models/alibaba-wan3-0/guides/prompting>
- Scenario, "Wan 3.0: The Essentials":
  <https://help.scenario.com/articles/4856166365-wan-3-0-the-essentials>
- Atlas Cloud, "How to Write Wan 3.0 Prompts":
  <https://www.atlascloud.ai/blog/tips/how-to-write-wan-3-0-prompt>
- OpenRouter, pedido de vídeo (`input_references`, áudio só no Seedance 2+):
  <https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request.md>
