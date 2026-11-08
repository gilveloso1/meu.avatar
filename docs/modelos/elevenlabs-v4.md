# ElevenLabs v4 (`elevenlabs/eleven-v4`)

Modelo de fala: o texto vira áudio (MP3), que entra no HeyGen Avatar como "Meu áudio" para virar o
vídeo falado. Estrutura `voz.ts` (`ELEVENLABS`), só para o administrador desde 08/11/2026.

Como chamar: `POST /api/v1/audio/speech` do OpenRouter com `model`, `input`, `voice` e
`response_format: "mp3"`. A resposta é o próprio áudio (128 kbit/s); erro vem em JSON. A lista dos
modelos de fala, com o preço (`pricing.prompt`, por caractere) e as vozes (`supported_voices`), está em
`GET /api/v1/models?output_modalities=speech`. A resposta não traz o custo: ele sai do preço vezes os
caracteres.

- **Preço:** US$ 0,00008 por caractere (US$ 80 por milhão), uns US$ 0,07 por minuto de fala em
  português (~900 caracteres). Perto do vídeo do HeyGen (US$ 0,0385/s, uns US$ 2,30 por minuto), pesa pouco.
- **Vozes:** as 21 prontas do ElevenLabs (Sarah, Brian, Alice…), todas multilíngues. O OpenRouter só
  dá o id; o gênero vem da biblioteca do ElevenLabs (`ELEVEN_GENDERS`). A amostra de cada voz é gerada
  uma vez (a frase `PREVIEW_TEXT`, menos de um centavo) e fica no R2 (`vozes/previas/elevenlabs/`).
- **Emoções:** aceita marcações entre colchetes no texto. No site, a pessoa digita `#` no Texto e
  escolhe numa lista em português (`EMOTIONS`); a emoção fica em destaque, com um x, e vai para o
  modelo em inglês (`[whispers]`, `[laughs]`, `[excited]`), a forma que o ElevenLabs conhece. Escrita à
  mão, em português ou em inglês, também é traduzida; outro texto entre colchetes segue igual. No teste
  de 08/11/2026, marcações em português não foram lidas em voz alta.
- **Voz clonada:** pelo OpenRouter, não (`supports_voice_cloning: false`). A API direta do ElevenLabs
  clona, mas pede conta e chave próprias, em plano pago.
- **Limite:** 10.000 caracteres por pedido; o site aceita até 5.000.

## Testes

**08/11/2026, comparação com o Fish Audio Drama 3** (`fish-audio/drama-3`), o mesmo texto de anúncio
(~230 caracteres), pelo terminal:

| Amostra | Duração | Tom médio |
|---|---|---|
| Sarah (mulher), neutra | 15,5 s | ~210 Hz |
| Sarah, com `[animada]`, `[sussurrando]`, `[rindo]` | 15,7 s | — |
| Brian (homem), neutra | 14,8 s | ~119 Hz |

A transcrição das amostras (Whisper) saiu igual ao texto, sem as marcações lidas. O dono achou os dois
muito bons: o ElevenLabs com qualidade levemente superior e preço maior, o Fish com boa qualidade e
preço baixo. Os dois vão para o site. As amostras ficaram em `temp/vozes/` (fora do git). Custo do
teste: uns US$ 0,10.
