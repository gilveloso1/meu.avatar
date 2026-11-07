# Gemini Omni 1.1 Flash (`google/gemini-omni-1.1-flash`): avatar falando, clipes curtos

**Estrutura `omni` (`src/structures/omni.ts`), só para o administrador, desde 07/11/2026.**
Ainda sem nenhum vídeo gerado. Uso pretendido: avatar falando a partir da foto e da fala,
com a voz e a boca saindo do modelo (como o [Wan 3.0](wan-3.0.md)), em clipes de até 10 s.

## O que o OpenRouter diz (`GET /api/v1/videos/models`, 07/11/2026)

- Modelo de vídeo e edição multimodal do Google, sucessor do Gemini Omni Flash Preview:
  texto para vídeo, imagem para vídeo, primeiro e último quadro. Entradas: texto, imagem e
  vídeo (sem áudio próprio). Repassa só o parâmetro `task` (valores não documentados).
- Foto como primeiro ou último quadro (`frame_images`).
- 3 a 10 s; 360p, 720p, 1080p e 4K; só 16:9 e 9:16.
- Sempre com áudio (`generate_audio: true`; não há preço sem áudio).

Preço por segundo, com áudio:

| Resolução | SKU | US$/s | 8 s | 10 s |
|---|---|---|---|---|
| 360p | `duration_seconds_with_audio_360p` | 0,0338 | 0,27 | 0,34 |
| 720p | `duration_seconds_with_audio_720p` | 0,1014 | 0,81 | 1,01 |
| 1080p | `duration_seconds_with_audio` (sem sufixo) | 0,1520 | 1,22 | 1,52 |
| 4K | `duration_seconds_with_audio_4k` | 0,3041 | 2,43 | 3,04 |

### Preço direto no Google (ai.google.dev/gemini-api/docs/pricing, 07/11/2026)

O Google cobra por tokens de saída: 1.931 tokens por segundo em 360p, 5.792 em 720p, 8.688
em 1080p e 17.376 em 4K (1080p e 4K com upsampling). No 1.1, US$ 17,50 por milhão de
tokens; no 1.2, US$ 12,00. Os preços do OpenRouter acima são exatamente esses tokens vezes
US$ 17,50/M: **o OpenRouter não cobra a mais**, e o SKU sem sufixo é mesmo o 1080p.

O único provedor no OpenRouter é o Google AI Studio (disponibilidade de 87% nos últimos 3
dias, 07/11/2026). No playground do OpenRouter, um vídeo de 1280×720 e 5 s custou
US$ 0,5068 (0,10136 × 5).

### O 1.1 acaba em 03/12/2026

O Google avisa: **a partir de 03/12/2026, todo pedido ao `gemini-omni-1.1-flash` vai para o
`gemini-omni-1.2-flash`** e é cobrado como 1.2. O 1.2 (`google/gemini-omni-1.2-flash` no
OpenRouter, de 05/11/2026) aceita as mesmas entradas, vai até 15 s e custa 31% menos, com
os mesmos preços no Google e no OpenRouter: US$ 0,0232/s em 360p, 0,0695 em 720p, 0,1043
em 1080p e 0,2085 em 4K (720p, 8 s: US$ 0,56).

## Estrutura (07/11/2026)

Formulário: Cena e Fala iguais às do Wan (estilo, instruções extras, idioma e texto, este
até 300 caracteres, cerca de 10 s de fala), foto do avatar (obrigatória, primeiro quadro),
duração, resolução e formato, todos da lista do modelo (padrão 8 s, 720p e o formato da
configuração). O prompt é o mesmo do Wan (`buildPrompt`, `src/prompt.ts`); o Google não publicou um guia de prompt do Omni no OpenRouter, então rever depois do primeiro teste. Sem tratamento
de áudio e sem Edição rápida até ver o primeiro resultado.

Custo na tela: o preço da resolução por segundo vezes a duração. Em 720p, 8 s: US$ 0,81.

## Próximo passo

Gerar o primeiro vídeo pelo site (gasta créditos; precisa de autorização): mesma foto e
fala de um vídeo do Wan, 720p, 9:16, 8 s. Ver se a boca acompanha a fala em português, a
voz e o volume (decidir `treatAudio`), se o 9:16 sai em 720×1280 e o custo real.
