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

**13/11/2026, primeiro teste real** (pelo agente, `gerar_video`): a foto principal da Marina
(apresentadora realista, a mesma dos testes do Omni) como primeiro quadro, 5 s (o mínimo do modelo),
480p, 9:16. Cena: "The woman in the photo looks straight into the camera, keeps the starting position
and speaks calmly in Brazilian Portuguese: "Oi, gente! Hoje eu trouxe uma novidade." Static camera,
medium close-up, no cuts." Vídeo `0d7410a9-e0f8-45ac-acac-f44658d57194` na lista do modelo.

| Pronto em | Custo real | Estimativa do site |
|---|---|---|
| menos de 1 min | **US$ 0,05** (US$ 0,01/s) | US$ 0,10 (a lista da API, US$ 0,02/s) |

- **Aceita rosto realista**: o primeiro do OpenRouter a gerar a Marina sem recusa desde o Wan (o
  Seedance e o Omni com instruções recusam).
- **Imagem**: 480×832, 5,17 s, 24 qps. Rosto, óculos, cabelo, roupa e cenário iguais aos da foto do
  começo ao fim; câmera parada; gesticula com as mãos (a foto já tinha as mãos abertas) e sorri no fim.
- **Fala**: a transcrição do site bate palavra por palavra ("Oi, gente! Hoje eu trouxe uma
  novidade."), dos 0,5 s aos 4,9 s, em português do Brasil.
- **Áudio**: −12,1 LUFS, pico real de −0,4 dBFS. Bem mais limpo que o Wan (−5 LUFS, com clipping):
  perto do alvo de −14 LUFS, sem tratamento por enquanto (`treatAudio: false`); ouvir antes de decidir.
- **Custo**: o cobrado é o da página do modelo (US$ 0,01/s em 480p), metade do que a lista da API diz.
  A estimativa do site, que lê a lista, sai o dobro. Conferir em outras resoluções antes de mudar a regra.
- **Comparação**: o mesmo vídeo no Wan 3.0 sairia US$ 0,21 (480p, mínimo de 5 s, no real).
  O HeyGen Video 1 custou um quarto disso.

Próximo: testar 768p e 1080p (o custo real e a qualidade), uma fala longa (acima de 15 s, outro preço)
e imagens de referência.
