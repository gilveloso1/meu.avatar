# meu.avatar

Estúdio de vídeos curtos com avatar realista falando, para redes sociais e
anúncios. Worker do Cloudflare com D1 e R2; os vídeos vêm da API de vídeo do
OpenRouter. Segue o mesmo molde do anb.bot (github.com/gilveloso1/anb.bot).
Como publicar e operar: [docs/operacao.md](docs/operacao.md).
O que falta fazer, em ordem: [docs/backlog.md](docs/backlog.md). Como o prompt
é montado e as medições de áudio: [docs/prompt.md](docs/prompt.md).

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

## Esboço e M3

- O layout segue o esboço aprovado no canvas (Design): disposição, tamanhos
  das áreas, cantos dos cards e painéis, cores de fundo e o que aparece em
  cada tela. Não troque o layout do esboço pelo padrão do M3.
- Dentro de cada parte, use o componente do M3 que existe para ela e as
  medidas dele: altura, espaçamento, ícone, tipografia, papéis de cor e
  estados (hover, foco, pressionado, desativado).
- Antes de montar ou mudar um componente, abra a página de specs dele em
  m3.material.io (`/components/<nome>/specs`). O site só carrega no
  navegador: use o Playwright (`document.body.innerText`); o WebFetch só traz
  o título. Os números do M3 Expressive também estão nos tokens do Compose
  (androidx, `compose/material3/.../tokens/*Tokens.kt`).
- Se o esboço e o M3 discordarem, pergunte ao usuário antes de escolher.
- Componentes do M3 Expressive no site (revisado em out/2026):
  - Menu: menu vertical (o menu de cantos quadrados é o antigo). Contêiner
    surface-container-low, cantos de 16 px, elevação 2, 4 px por dentro;
    itens de 44 px, ícone de 20 px, 16 px nas laterais, 12 px entre ícone e
    texto, body-large; divisor sem ocupar a largura toda.
  - Lista: lista expressiva. Item escolhido em primary-container com cantos
    de 16 px; no estilo segmentado, 2 px entre itens, cantos de 4 px por
    dentro e 16 px nas pontas.
  - Botões segmentados: o M3 Expressive troca por grupo de botões conectados
    (2 px entre botões, ponta toda arredondada, cantos internos de 8 px no
    tamanho S; o escolhido fica todo arredondado).
  - Chip de filtro: 32 px, cantos de 8 px, ícone de 18 px, 16 px nas
    laterais (8 px do lado do ícone).
  - FAB estendido (pequeno): 56 px, cantos de 16 px, ícone de 24 px, 16 px
    nas laterais, 8 px entre ícone e texto; cores primárias (as de superfície
    não são mais recomendadas).
  - Barra de busca: 56 px, cantos inteiros, surface-container-high, sem
    contorno, de 360 a 720 px de largura.
  - Card: cantos de 12 px no padrão, 16 px de margem interna, até 8 px entre
    cards; preenchido em surface-container-highest. (O esboço usa cantos de
    28 px, o token extra-large.)
  - Campo de texto contornado: 56 px, 16 px nas laterais, texto de apoio
    4 px abaixo.
  - Diálogo básico: cantos de 28 px, 24 px de margem, de 280 a 560 px.
  - Indicador de progresso linear: 4 px, pontas arredondadas, folga entre o
    indicador e a trilha.
  - Snackbar: inverse-surface, inverse-on-surface e ação em inverse-primary.

## Contas

- Contas e sessões vêm do estuda.mais (github.com/gilveloso1/estuda.mais,
  `src/auth.ts`). Antes de mexer em login, convite ou permissão, leia o
  original e porte de lá.
- Permissões sempre conferidas no servidor; teste novo para cada caso de
  acesso negado.

## Modelos: uma estrutura para cada

- Cada modelo de vídeo é uma estrutura em `src/structures/` (hoje `wan.ts` e
  `heygen.ts`): campos do formulário, prompt de sistema, montagem do pedido,
  regra de custo, se o áudio passa pelo contêiner e se o vídeo pronto tem o
  botão "Edição rápida" (`quickEdit`, `container/editar.py`). A tela inicial tem um card
  por modelo e uma aba com os vídeos de todos (`/videos`); a página do modelo
  (`/modelo/<id>`) tem três painéis: a configuração, o vídeo escolhido
  (`?video=<id>`) com a caixa da fala embaixo, e a lista de vídeos dele, com
  "Detalhes" (diálogo). O nome do site é "Meu Avatar".
- Cada vídeo guarda a estrutura que o gerou (`videos.structure`) e as
  configurações próprias dela (`videos.settings`, JSON).
- Modelo novo é estrutura nova, sem mexer nas outras. O Wan fica como está.
  Estrutura em teste usa `access: "admin"` (só o administrador vê).

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
