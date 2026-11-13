# HeyGen Video 1 (`heygen/heygen-video-1`)

Vídeo geral da HeyGen (não é o Avatar IV): a cena escrita inteira, com fala, ambiente e efeitos
gerados junto, de 5 a 30 s. Estrutura `heygen-video.ts` (`heygen-video`), só para o administrador
(em teste), desde 13/11/2026, no site e no agente (`gerar_video {modelo: "heygen-video"}`), com as
peças das versões livres (`livre.ts`).

O que se sabe (lista de modelos e guia do modelo no OpenRouter, 13/11/2026):

- **Pedido**: `prompt`, `duration` (5 a 30 s), `resolution` (480p, 768p, 1080p, 2K), `aspect_ratio`
  (21:9, 16:9, 4:3, 1:1, 3:4, 9:16), primeiro quadro (`frame_images`, só `first_frame`), imagens de
  referência (`input_references`) e `seed`. Sem último quadro e sem `generate_audio`: o som vem sempre.
  Opção do provedor: `prompt_enhancement` (a estrutura não manda).
- **Custo** (lista da API): por segundo, US$ 0,02 em 480p, 0,036 em 768p e 0,10 em 1080p e 2K; acima
  de 15 s, 0,045, 0,075 e 0,105; com imagens de referência, 0,07, 0,10 e 0,18; mais US$ 0,04 por
  imagem de referência (`reference_input_images`, fora da estimativa). A página do modelo mostra
  valores menores (US$ 0,01/s em 480p, 0,035 com referências e US$ 0,02 por imagem depois das duas
  primeiras): conferir no primeiro teste qual vale.
- Comparação: o Wan 3.0 custa US$ 0,05/s em 480p (0,0425 no real) e cobra no mínimo 5 s.

## Testes

Nenhum ainda. O primeiro teste real (só com o sim do dono): a foto de um avatar realista como
primeiro quadro, uma fala curta em português, 8 s, 480p, 9:16. Conferir se aceita rosto realista, a
fala (palavras, boca, idioma), o volume do áudio (para decidir o tratamento no contêiner) e o custo real.
