# Modelos: o que está sendo testado

Registro de todo modelo que o meu.avatar usa ou já testou: para que serve, o
estado, o que se viu e quanto custou. **Um arquivo por modelo**, nesta pasta,
com o resumo abaixo. **Antes de escolher ou montar um modelo, leia aqui.**
Depois de cada teste (bom ou ruim), atualize o arquivo do modelo e o resumo no
mesmo PR; modelo novo ganha arquivo novo.

Estados:

- **No ar**: liberado para todos (`access: "all"`).
- **Em teste**: estrutura no ar só para o administrador (`access: "admin"`), ou
  teste feito pelo terminal, sem estrutura.
- **Bloqueado**: o provedor recusa o uso pretendido. A estrutura fica como
  está (pode servir a outro uso); o motivo e a prova ficam aqui.
- **Descartado**: testado e não serve; a estrutura sai.

Como registrar um teste: data, o que foi pedido (vídeo, foto, ajustes), o
resultado (com a mensagem do provedor, se falhou), o custo real e o próximo
passo. Vídeos de teste não vão para o repositório; diga onde estão (id no D1 ou
caminho no R2).

## Resumo

| Modelo | Uso | Estado | Estrutura |
|---|---|---|---|
| [Wan 3.0](wan-3.0.md) (`alibaba/wan-3.0`) | Avatar falando, a partir da foto e da fala | No ar | `wan.ts` |
| [HeyGen Avatar IV](heygen-avatar-iv.md) (`heygen/avatar-iv`) | Avatar falando, voz pronta da HeyGen | Em teste. A API direta da HeyGen sai mais barata (US$ 0,0385/s, contra US$ 0,05/s) e aceita áudio próprio e voz clonada | `heygen.ts` |
| [Seedance 2.0](seedance-2.0.md) (`bytedance/seedance-2.0`) | Trocar avatar (vídeo + foto) | **Bloqueado** para vídeo com rosto realista | `seedance.ts` |
| [Runway Aleph 2](runway-aleph-2.md) (`runway/aleph-2`) | Trocar avatar (vídeo + 5 quadros com o rosto trocado) | Em teste: a receita do terceiro teste troca o avatar e mantém o áudio. Cobrou US$ 1,40 por pedido até 20 s, mais ≈ US$ 0,22 de imagens | `aleph.ts` |
| [Gemini Nano Banana 2.1](gemini-nano-banana-2.1.md) (`google/gemini-nano-banana-2.1`) | Trocar o rosto nos quadros-chave do Aleph 2; esboço inicial dos vídeos (com ou sem foto de referência) | Em teste, dentro do `aleph.ts`. Estrutura de imagem só para o administrador: o melhor na comparação de 06/11/2026 (US$ 0,04 por imagem em 1K) | `imagem.ts` |
| `anthropic/claude-haiku-5.5` | Conferir o fundo dos quadros-chave do Aleph 2 | Em teste, dentro do `aleph.ts` (ver [runway-aleph-2.md](runway-aleph-2.md)) | — |
| [Grok Imagine Video 1.5 Lite](grok-imagine-video-1.5-lite.md) (`x-ai/grok-imagine-video-1.5-lite`) | Cena sem fala, a partir da foto | Em teste: fez as duas cenas pelo terminal (US$ 0,03/s em 720p); vem com som mesmo sem áudio. Estrutura só para o administrador, no ar desde 06/11/2026 | `grok.ts` |
| [Gemini Omni 1.2 Flash](gemini-omni-1.2-flash.md) (`google/gemini-omni-1.2-flash`) | Avatar falando, a partir da foto e da fala, em clipes de 3 a 15 s | Em teste: estrutura só para o administrador desde 07/11/2026, primeiro vídeo em 07/11 (8 s, US$ 0,56, pronto em 54 s, fala exata, áudio limpo a −20 LUFS). US$ 0,07/s em 720p, com áudio (o mesmo preço do Google direto). O 1.1 fica no seletor Versão enquanto o 1.2 está instável (o Google passa o 1.1 para o 1.2 em 03/12/2026) | `omni.ts` |
| [Veo 3.1 Lite](veo-3.1-lite.md) (`google/veo-3.1-lite`) | Cena sem fala, a partir da foto | Em teste pelo terminal: fez uma cena e o filtro recusou a outra (US$ 0,03/s em 720p) | — |
| `bytedance-seed/seedream-5-0-flash` | Esboço inicial | Descartado para esboço com referência: manteve a pessoa do print em vez do avatar (ver [gemini-nano-banana-2.1.md](gemini-nano-banana-2.1.md)) | — |
| `qwen/qwen-image-2.1-turbo` | Esboço inicial | Opção barata (US$ 0,018): manteve o rosto, mas copiou o gesto da foto e sai em 576×1024 (ver [gemini-nano-banana-2.1.md](gemini-nano-banana-2.1.md)) | — |
| [ElevenLabs v4](elevenlabs-v4.md) (`elevenlabs/eleven-v4`) | Fala a partir do texto (o áudio vira o vídeo no HeyGen, como Meu áudio) | Em teste: estrutura só para o administrador desde 08/11/2026, 21 vozes prontas, US$ 0,00008 por caractere (uns US$ 0,07 por minuto). Sem voz clonada pelo OpenRouter | `voz.ts` |
| `fish-audio/drama-3` | Fala a partir do texto, com direção de atuação | Testado em 08/11/2026 contra o ElevenLabs (ver [elevenlabs-v4.md](elevenlabs-v4.md)): boa qualidade por US$ 0,000002 por caractere; 16 vozes da biblioteca aprovadas. Estrutura no próximo PR | — |
| [Higgsfield Genjutsu](higgsfield-genjutsu.md) (fora do OpenRouter) | Trocar avatar | Não testado | — |
