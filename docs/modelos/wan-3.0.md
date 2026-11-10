# Wan 3.0 (`alibaba/wan-3.0`)

No ar desde o começo. A voz sai alta e com chiado pelo OpenRouter; o contêiner
trata o áudio. Medições em `docs/prompt.md` e `docs/backlog.md`.

## Wan 3.0 livre (`wan-livre.ts`, 10/11/2026)

Em teste, só para o administrador: o mesmo modelo com tudo o que o OpenRouter aceita dele, para o
agente (`gerar_video_wan` do MCP) e como versão "Livre" na página do Wan. A cena é o prompt inteiro,
sem o molde do `src/prompt.ts`.

- **Texto para vídeo**: só a cena.
- **Imagem para vídeo**: `frame_images` com `first_frame` e/ou `last_frame`.
- **Referência para vídeo**: imagens em `input_references` (`image_url`). O OpenRouter não diz o
  máximo; o site aceita até 4. Com quadros e referências juntos, o OpenRouter trata o pedido como
  imagem para vídeo (guia de geração de vídeo do OpenRouter), por isso o site recusa os dois juntos.
- `generate_audio` (sem som, o vídeo não passa pelo tratamento de áudio) e `seed`.
- Duração de 2 a 30 s; 480p, 720p e 1080p (US$ 0,05, 0,10 e 0,20 por segundo).

Ainda sem teste real (gasta créditos): falta conferir a referência para vídeo e o último quadro.
