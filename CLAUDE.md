# meu.avatar

Estúdio de vídeos curtos com avatar realista falando, para redes sociais e
anúncios. Worker do Cloudflare com D1 e R2; os vídeos vêm da API de vídeo do
OpenRouter. Segue o mesmo molde do anb.bot (github.com/gilveloso1/anb.bot).
Como publicar e operar: [docs/operacao.md](docs/operacao.md).

## Site leve

- As páginas são HTML montado no Worker (`src/site/site.ts`), com CSS
  (`src/site/style.ts`, tokens e componentes do Material Design 3, como no
  anb.bot) e poucas linhas de script embutidos, sem framework nem biblioteca
  de interface. Mantenha assim e siga o M3 (m3.material.io) em todo componente.
- Cores só por `npm run tema`, que gera `src/site/theme.ts` pelo algoritmo do
  M3; não edite as cores à mão. Fontes: Roboto e Material Symbols do Google
  Fonts, só com os ícones listados em `ICONS`.
- Nada de biblioteca de componentes ou de CSS (nem de CDN) sem combinar antes
  com o usuário.

## Contas

- Contas e sessões vêm do estuda.mais (github.com/gilveloso1/estuda.mais,
  `src/auth.ts`). Antes de mexer em login, convite ou permissão, leia o
  original e porte de lá.
- Permissões sempre conferidas no servidor; teste novo para cada caso de
  acesso negado.

## OpenRouter

- Gerar vídeo gasta créditos. Testes usam a API falsa (`test/helpers.ts`);
  chamada real ao `POST /api/v1/videos` só com autorização do usuário.
- Os valores aceitos (duração, resolução, formato, preço) vêm de
  `GET https://openrouter.ai/api/v1/videos/models`; não fixe listas no código.

## Migrations e deploy

- O Claude roda as migrations e publica **sempre depois de pedir autorização**
  ao usuário no chat. A autorização vale só para aquela vez.
- Ordem: primeiro `npm run db:migrar`, depois `npm run deploy`.
- Branch novo sempre a partir do `main` do GitHub (`git fetch` e
  `git checkout -b <nome> origin/main`). Antes de publicar de um branch,
  confira que `git log HEAD..origin/main` sai vazio.
- Use `< /dev/null` no fim dos comandos do wrangler que pedem confirmação.
- Neste ambiente cloud, o `fetch` do Node só passa pelo proxy com
  `NODE_USE_ENV_PROXY=1` (para `npm run gerar`).
