# Gemini Omni 1.2 Flash (`google/gemini-omni-1.2-flash`): avatar falando, clipes curtos

**Estrutura `omni` (`src/structures/omni.ts`), só para o administrador, desde 07/11/2026.**
Ainda sem nenhum vídeo gerado. Uso pretendido: avatar falando a partir da foto e da fala,
com a voz e a boca saindo do modelo (como o [Wan 3.0](wan-3.0.md)), em clipes de até 15 s.

A estrutura começou no 1.1 (`google/gemini-omni-1.1-flash`) e passou para o 1.2 no mesmo
dia: o Google avisa que, **a partir de 03/12/2026, todo pedido ao 1.1 vai para o 1.2** e é
cobrado como 1.2. O 1.2 aceita as mesmas entradas, vai até 15 s (o 1.1 ia até 10 s) e
custa 31% menos.

## O que o OpenRouter diz (`GET /api/v1/videos/models`, 07/11/2026)

- Modelo de vídeo e edição multimodal do Google (de 05/11/2026): texto para vídeo, imagem
  para vídeo, primeiro e último quadro, referências de pessoa e de vídeo (até três clipes),
  editar ou estender um vídeo enviado. Entradas: texto, imagem e vídeo (sem áudio próprio).
  Repassa só o parâmetro `task` (valores não documentados).
- Foto como primeiro ou último quadro (`frame_images`).
- 3 a 15 s; 360p, 720p, 1080p e 4K; só 16:9 e 9:16.
- Sempre com áudio (`generate_audio: true`; não há preço sem áudio).

Preço por segundo, com áudio:

| Resolução | SKU | US$/s | 8 s | 15 s |
|---|---|---|---|---|
| 360p | `duration_seconds_with_audio_360p` | 0,0232 | 0,19 | 0,35 |
| 720p | `duration_seconds_with_audio_720p` | 0,0695 | 0,56 | 1,04 |
| 1080p | `duration_seconds_with_audio` (sem sufixo) | 0,1043 | 0,83 | 1,56 |
| 4K | `duration_seconds_with_audio_4k` | 0,2085 | 1,67 | 3,13 |

### Preço direto no Google (ai.google.dev/gemini-api/docs/pricing, 07/11/2026)

O Google cobra por tokens de saída: 1.931 tokens por segundo em 360p, 5.792 em 720p, 8.688
em 1080p e 17.376 em 4K (1080p e 4K com upsampling), a US$ 12,00 por milhão no 1.2 (no
1.1, US$ 17,50). Os preços do OpenRouter acima são exatamente esses tokens vezes
US$ 12,00/M: **o OpenRouter não cobra a mais**, e o SKU sem sufixo é mesmo o 1080p.

O único provedor no OpenRouter é o Google AI Studio. No playground do OpenRouter, um vídeo
do 1.1 de 1280×720 e 5 s custou US$ 0,5068 (o preço do 1.1, 0,10136 × 5).

## Estrutura (07/11/2026)

Formulário: Cena e Fala iguais às do Wan (estilo, instruções extras, idioma e texto, este
até 250 caracteres, cerca de 15 s de fala), foto do avatar (obrigatória, primeiro quadro),
duração, resolução e formato, todos da lista do modelo (padrão 8 s, 720p e o formato da
configuração). O prompt é o mesmo do Wan (`buildPrompt`, `src/prompt.ts`); o Google não
publicou um guia de prompt do Omni no OpenRouter, então rever depois do primeiro teste. Sem
tratamento de áudio e sem Edição rápida até ver o primeiro resultado.

Custo na tela: o preço da resolução por segundo vezes a duração. Em 720p, 8 s: US$ 0,56.

## Próximo passo

Gerar o primeiro vídeo pelo site (gasta créditos; precisa de autorização): mesma foto e
fala de um vídeo do Wan, 720p, 9:16, 8 s. Ver se a boca acompanha a fala em português, a
voz e o volume (decidir `treatAudio`), se o 9:16 sai em 720×1280 e o custo real.
