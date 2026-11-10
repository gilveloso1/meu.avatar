# Wan 3.0 (`alibaba/wan-3.0`)

No ar desde o começo. A voz sai alta e com chiado pelo OpenRouter; o contêiner
trata o áudio. Medições em `docs/prompt.md` e `docs/backlog.md`.

## Wan 3.0 livre (`wan-livre.ts`, 10/11/2026)

Em teste, só para o administrador: o mesmo modelo com tudo o que o OpenRouter aceita dele, para o
agente (`gerar_video {modelo: "wan-livre"}` do MCP) e como versão "Livre" na página do Wan. A cena é o prompt inteiro,
sem o molde do `src/prompt.ts`.

- **Texto para vídeo**: só a cena.
- **Imagem para vídeo**: `frame_images` com `first_frame` e/ou `last_frame`.
- **Referência para vídeo**: imagens em `input_references` (`image_url`). O OpenRouter não diz o
  máximo; o site aceita até 4. Com quadros e referências juntos, o OpenRouter trata o pedido como
  imagem para vídeo (guia de geração de vídeo do OpenRouter), por isso o site recusa os dois juntos.
- `generate_audio` (sem som, o vídeo não passa pelo tratamento de áudio) e `seed`.
- Duração de 2 a 30 s; 480p, 720p e 1080p (US$ 0,05, 0,10 e 0,20 por segundo).

Primeiro teste real (10/11/2026, o agente pelo MCP, três vídeos na lista do Wan, versão Livre):

| Vídeo (id no D1) | Pedido | Custo | O que se viu |
|---|---|---|---|
| `028299fd-331e-4085-a051-a0a776d3b351` | Primeiro e último quadro, com som e fala em português, 6 s, 720p | US$ 0,51 | **O último quadro funciona**: o vídeo termina na imagem pedida (pose, sorriso, boca fechada). Rosto e cena iguais do começo ao fim. A fala entre aspas saiu de 1,75 a 5,2 s, com a boca acompanhando; o áudio passou pelo tratamento |
| `428afdb0-9f02-4451-8a0f-0d0a72b6d074` | Primeiro quadro, sem som, 6 s, 480p | US$ 0,255 | Mãos só, como pedido; sem tratamento de áudio |
| `fef8324d-bf4c-4019-adb4-1f63207c4f70` | Primeiro quadro, sem som, 3 s, 480p | US$ 0,2125 | O vídeo tem 3 s, mas foi cobrado como 5 s: **parece haver cobrança mínima de 5 s** |

- **Custo real abaixo da tabela**: US$ 0,0425 por segundo em 480p e 0,085 em 720p (o OpenRouter mandou
  para a Alibaba Cloud Int.), contra 0,05 e 0,10 da lista de modelos. A estimativa do site, que lê a
  lista, sai uns 15% acima. Abaixo de 5 s não compensa: custa o mesmo que 5 s. A estimativa já conta
  esse mínimo (`billed: { min: 5 }` no `wan.ts` e no `wan-livre.ts`, desde 10/11/2026).
- **Sem som não é sem faixa**: com `generate_audio: false`, o vídeo ainda vem com uma faixa de som
  (sem silêncio medido, um ruído de fundo), como no Grok. Por cima entra outro áudio no canvas.
- Falta testar a referência para vídeo (`referencias`).
