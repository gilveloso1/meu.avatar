# meu.avatar

Estúdio de **vídeos curtos com avatar realista falando um texto**, para redes
sociais e anúncios. Você entra com sua conta (a primeira conta criada é a do
administrador, e o cadastro fecha depois dela), escreve o prompt (quem é o avatar, cenário, a fala
exata), envia a foto do avatar e recebe o MP4.

Roda no **Cloudflare Workers**, com banco D1 e arquivos no R2, no mesmo molde
do [anb.bot](https://github.com/gilveloso1/anb.bot). Os vídeos vêm da
[API de vídeo do OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation.md);
o padrão é o **Wan 3.0**, 25 s, 480p, 9:16, com áudio (≈ US$ 1,25 por vídeo).

- Como funciona, chaves e como publicar: [docs/operacao.md](docs/operacao.md)

## Estrutura

| Arquivo | O quê |
|---|---|
| `src/index.ts` | Rotas do Worker: webhook do OpenRouter, estúdio, agendamento |
| `src/auth.ts` | Contas e sessões (portado do estuda.mais): bcrypt, bloqueio, primeiro cadastro vira admin |
| `src/studio.ts` | Pede o vídeo, acompanha o job e guarda o MP4 no R2 |
| `src/openrouter.ts` | Cliente da API de vídeo (validação, custo, assinatura do webhook) |
| `src/db.ts` | Tabela `videos` no D1 |
| `src/site/` | Páginas (HTML no Worker) e visual Material Design 3; cores em `theme.ts`, geradas por `npm run tema` |
| `tools/gerar-video.ts` | Gerar pelo terminal, sem o Worker (`npm run gerar`) |
| `test/` | Testes (Vitest no ambiente do Workers, OpenRouter falso) |
