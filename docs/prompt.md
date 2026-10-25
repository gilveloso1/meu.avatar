# Prompt dos vídeos

Como escrever o prompt para o Wan 3.0 e o que o estúdio acrescenta sozinho.
Pesquisa de 25/10/2026, depois do primeiro vídeo sair com o áudio agudo e
estourado.

## O que o estúdio acrescenta (src/prompt.ts)

Todo pedido leva, no fim do prompt da pessoa, uma orientação fixa em inglês
(`QUALITY_GUIDE`, 76 palavras): uma voz só, gravada de perto num microfone de
lapela em sala silenciosa; timbre natural no tom real da pessoa, ritmo de
conversa, volume moderado e constante, sibilantes suaves; sem música, efeitos,
eco, distorção ou clipping; "Lip sync"; fala em português do Brasil com
exatamente as palavras entre aspas; vídeo fotorrealista, enquadramento firme e
sem texto, legenda ou marca d'água na tela.

O banco guarda os dois: `prompt` (o que a pessoa escreveu) e `request_prompt`
(o que foi para o modelo), para comparar quando a orientação mudar.

## Como escrever o prompt

- **A fala entre aspas, com quem fala e o verbo antes:** `A mulher olha para a
  câmera e diz: "Oi, gente! …"`. É o formato do guia oficial do Wan 3.0. Sem
  aspas, o modelo pode trocar ou inventar palavras.
- **Tamanho da fala:** uns 2,2 a 2,6 palavras por segundo (55 a 65 palavras
  em 25 s). Fala longa demais sai corrida e mais aguda.
- **Com foto (primeiro quadro), descreva o movimento, não a pessoa:** a foto
  já mostra quem é. Diga o que ela faz e como a câmera se comporta.
- **Prompt curto:** o Higgsfield recomenda até ~200 tokens no total; a
  orientação fixa já usa uns 100.
- **Diga o que quer, não só o que não quer:** "nítido" funciona melhor que
  "sem borrão".

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
