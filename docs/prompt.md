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

Por isso a voz baixa é pedida duas vezes: no verbo da fala (`says softly, in
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
