# meu.avatar

Estúdio de vídeos curtos com avatar realista falando, para redes sociais e
anúncios. Worker do Cloudflare com D1 e R2; os vídeos vêm da API de vídeo do
OpenRouter. Segue o mesmo molde do anb.bot (github.com/gilveloso1/anb.bot).
Como publicar e operar: [docs/operacao.md](docs/operacao.md).
O que falta fazer, em ordem: [docs/backlog.md](docs/backlog.md). Como o prompt
é montado e as medições de áudio: [docs/prompt.md](docs/prompt.md).

## Direção (29/10/2026)

- **Gere aqui, edite aqui, publique aqui.** O meu.avatar é o ambiente onde a
  pessoa faz o vídeo do começo ao fim, sem sair do site.
- **Usar APIs prontas, não construir a engenharia do zero.** O vídeo vem de
  modelos e serviços que já fazem o trabalho; não montar pipelines próprios
  (quadros-chave, composição, correção de imagem) para compensar o que um
  modelo não faz. Se um modelo não serve, procure outro pronto.
- **Continuar reduzindo custos**: entre opções prontas que entregam o mesmo
  resultado, a mais barata; mostrar o custo antes de gerar.
- **O esforço de construção vai para a UI/UX**: telas amigáveis, fáceis de
  trabalhar e de criar. Quem usa quer o resultado final, mesmo que mais
  simples, e paga por ele.
- **Quem paga ganha dinheiro com os vídeos**: cria audiência (perfis, canais)
  ou faz anúncios no estilo UGC para marcas DTC. Cada tela deve ajudar a sair com mais vídeos que
  dão retorno: rápido de fazer, em quantidade, no formato das redes e dos
  anúncios, e pronto para publicar.

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
- Exceção combinada: o canvas de edição (`/canvas`, só o administrador) tem um
  script de verdade, em módulos sem biblioteca em `src/canvas/` (tela, modelo,
  prévia). `npm run canvas` junta tudo em `src/site/canvas.ts` (gerado; não edite
  à mão) e `npm run teste:canvas` roda os testes do modelo. Como funciona e o que
  foi decidido: [docs/canvas.md](docs/canvas.md). A exportação dos projetos fica em
  `src/exportar.ts` e `container/exportar.py`.

## Reaproveitar componentes

- Antes de criar um componente, procure em `src/site/site.ts` e `src/site/style.ts`
  o que já existe. Se uma tela nova tem algo igual a outra, ela usa o mesmo
  componente, com o mesmo HTML e as mesmas classes; nada de cópia parecida. Não
  basta as medidas baterem: abra as duas telas lado a lado.
- Se o que existe quase serve, generalize o componente (uma opção a mais) em vez
  de escrever outro. Vale também para o script da página e o CSS.
- Componentes do site:
  - Telas de lista: `pageHead` (título, contagem, texto e botão principal).
  - Botão principal: `fab` (link ou envio) e `fabUpload` (escolher arquivo). O padrão é o
    "Novo vídeo" da página Vídeos; nunca escreva `class="fab"` à mão.
  - Listagem: `library` (vistas, filtros, ordem, agrupar por data), usada por
    `videoLibrary` e `assetLibrary`. Lista nova só diz os itens, card, linha, filtros e colunas.
  - Cards de escolha: `tileCard` dentro de `.tile-grid` (Modelos, Avatares, Projetos).
  - Painel de configuração: `pane pane--config` em `.workspace`, com `formField`, e `filePicker`
    para foto, vídeo e áudio.
  - Item aberto: o molde da página do vídeo (`.viewer`), como a página de um ativo.
  - Escolher um avatar: `avatarDialog` (diálogo básico do M3, com busca), em "Salvar no avatar" e
    "Usar um avatar".
  - Confirmação de apagar: `.confirm`; estado vazio: `emptyState`.

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
  - Campo de seleção (lista de opções, como a voz): sempre o menu feito com
    script em `SCRIPT` (`src/site/site.ts`), aplicado a todo
    `.text-field--select`. O `<select>` fica escondido e é ele que vai no
    formulário; o botão abre um menu vertical (`.select-menu`, popover) com o
    escolhido em secondary-container, a seta vira arrow_drop_up e há teclado
    (setas, Home, End, Enter, Espaço, Esc, Tab). Não use a lista nativa do
    navegador nem o `md-outlined-select` do Material Web (parado e sem o
    Expressive).
  - Lista: lista expressiva. Item escolhido em primary-container com cantos
    de 16 px; no estilo segmentado, 2 px entre itens, cantos de 4 px por
    dentro e 16 px nas pontas.
  - Botões segmentados: o M3 Expressive troca por grupo de botões conectados
    (2 px entre botões, ponta toda arredondada, cantos internos de 8 px no
    tamanho S). Exceção pedida pelo usuário: o escolhido mantém a forma
    (não fica todo arredondado como no M3); só muda a cor para primary.
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
  - Indicador de progresso: o padrão do site para qualquer espera, `.linear-progress`
    (primary sobre secondary-container, 4 px, 4 px de folga). Indeterminado até haver
    andamento; com `--determinate` e `--progress` (0 a 1), mostra o andamento e o ponto de
    parada. Toda ação demorada mostra retorno no clique, antes da resposta do servidor.
    Hoje só a exportação usa o determinado; o envio do canvas usa o indeterminado no snackbar.
  - Indicador circular no botão: `.spinner` (SVG e CSS), o padrão para ação de botão que espera
    o servidor. Centralizado, na cor do texto do botão, sem trilha, 24 px com traço de 2,4 px (a
    proporção de 40 e 4 px do M3); o botão mantém a largura e a cor cheia (a opacidade de
    desativado cairia abaixo de 3:1). Vem sozinho em todo `POST` de `.button`, `.fab` e
    `.avatar-option` (`SCRIPT`). Em lista, só no item tocado, à direita, nunca em todos.
  - Snackbar: inverse-surface, inverse-on-surface e ação em inverse-primary.

## Telas aprovadas (out/2026)

Aprovadas com o usuário em 27/10/2026. Mudar só se ele pedir; tela nova segue o mesmo molde.

- Página do modelo (`/modelo/<id>`): seta de voltar no lugar do logo; à esquerda
  o painel de Configuração (400 px, não recolhe, ocupa a altura da janela, rola
  por dentro). Nele, a foto do avatar é uma área só (item de lista, ícone de
  rosto, sem dica); o bloco Fala tem a voz ou o idioma primeiro e o campo
  "Texto" (cresce com o texto, como o Movimento); no fim, a estimativa (Duração
  e Custo estimado, linhas com ícone) e o "Gerar vídeo" na largura toda, sem
  fixar, com espaço sobrando embaixo. No centro, a lista de vídeos.
- Lista de vídeos (`videoLibrary`, a mesma na página do modelo e em `/videos`):
  cards quadrados sem texto, só a imagem (cantos de 16 px e a sombra de nível 1
  do M3, sem moldura branca), o vídeo preenchendo o quadrado; vistas em grupo de botões
  conectados (cards pequenos, médios, grandes e Detalhes, uma linha por vídeo
  com colunas); chips de filtro por status, chip de ordem e chip "Agrupar por
  data" (desligado por padrão). Tudo no navegador, sem recarregar, e guardado
  no `localStorage` por lista (`lista-<modelo>`, `lista-videos`). Miniatura só
  baixa quando aparece na tela e enquadra o rosto (`videos.face`, achado pelo
  agendamento, um vídeo por minuto; sem rosto, o terço de cima). Imagens e vídeos dos
  avatares seguem o mesmo enquadramento (`avatar_assets.face`). Com mouse, o
  vídeo aproxima de leve (1,06, 300 ms) dentro do card. No Safari, o recorte do
  vídeo fica preso às bordas do card (`inset: 0`), não em `height: 100%`. A busca pela fala de `/videos` fica no servidor.
- Página do vídeo (`/video/<id>`, aberta por qualquer lista; `?de=` diz para
  onde a seta e o X voltam, só caminho do site): ocupa a tela abaixo da barra
  superior. À esquerda, o vídeo no formato dele (sem faixas) sobre fundo
  escuro liso `#2a2a2a`, setas de anterior e próximo (na ordem da lista de onde
  veio) a 16 px do vídeo, e a barra própria do player (tocar, tempo, slider,
  som, tela cheia), que também comanda a prévia da edição rápida. À direita, a
  folha de 400 px: status e X; abas Informações e Edição rápida (só onde há;
  abas principais fixas do M3, de borda a borda da folha, indicador de 3 px só sob
  o ícone e o texto; no celular, 16 px abaixo da barra do player); o status e o
  conteúdo na mesma margem de 24 px;
  em Informações, Texto (com Copiar), os textos livres (Movimento, Instruções
  extras) em bloco próprio e Detalhes no card de linhas (ícone, rótulo, valor);
  embaixo, Refazer (volta ao modelo com tudo preenchido, `?refazer=<id>`) e
  Baixar (menu quando há mais de uma versão: Original, Editado e, se o áudio foi
  tratado, "Sem tratamento de áudio"). Na Edição rápida, o card
  "Resultado da edição", Pausas, Câmera, "Gerar prévia" e, presos embaixo,
  Cancelar e Gerar editado. Abrir a aba não analisa nada: a prévia só é feita no
  "Gerar prévia" e, pronta, começa a tocar; o botão vira "Prévia gerada",
  desligado, e nunca é um segundo tocar (quem toca e pausa é a barra do player,
  cujo slider mostra o andamento da prévia; no fim, o tocar vira "ver de novo").
  Trocar uma escolha não mexe na prévia: o botão volta a "Gerar prévia" ("Ajustes
  mudaram. Gere de novo.") e refaz na hora, sem analisar o vídeo de novo; o
  editado sai sempre com as escolhas marcadas. Durante a edição, a Informações
  mostra o card "Editando o vídeo" com o progresso.
  Vídeo já editado: a aba mostra só Original | Editado (troca o vídeo do player;
  a Informações não repete isso), o card "Este vídeo já foi editado" (linhas com
  ícone: Editado em, Pausas, Câmera, de `edited_at`/`edited_plan`, gravados só
  quando a edição termina bem) e "Editar de novo"; só então aparecem os ajustes
  (com as escolhas da edição que vale), o aviso "A nova edição substitui a atual."
  e "Substituir editado". O editado é um arquivo só (a nova edição substitui) e o
  endereço dele leva `?v=<edited_at>`, para o navegador não mostrar a anterior.
- Página do vídeo na tela larga: tem a altura da janela, nunca rola; o vídeo
  encolhe para caber (pelo formato) e a folha rola por dentro.
- Textos: frases de ajuda curtas, numa linha; na língua de quem usa, nunca de
  quem desenvolve (nada de nome de segredo ou de modelo técnico na tela; o
  detalhe vai para o log). Avisos de configuração não aparecem no computador
  (`AMBIENTE=local`).
- Erros: toda frase de erro da tela vem de `src/erros.ts` (`ERROS.<chave>`), no
  molde `erro("O que houve.", "O que fazer.")` ou, para campo do formulário,
  `campo("O que fazer.")`; as regras estão no topo do arquivo. Erro novo é chave
  nova lá; `test/erros.test.ts` recusa frase fora do molde ou escrita fora do
  catálogo. O motivo técnico fica no banco e no log, nunca na tela.
- Avatares (`/avatares`, logo depois de Modelos, aprovada em 30/10/2026): cards iguais
  aos de Modelos, com a foto principal de capa. Só guarda ativos e não depende de
  nenhum modelo. A página do avatar segue a do modelo: painel com Nome, Descrição, Foto
  principal e Voz para clonagem; no centro, a listagem de ativos; tocar num ativo abre o
  molde da página do vídeo. O avatar só existe depois de Salvar (`/avatares/novo`, nunca
  criar no clique). "Salvar no avatar" fica abaixo de Detalhes e abre o diálogo com busca;
  o Novo avatar desse diálogo leva o vídeo junto (`?video=`), salvo com o avatar. O avatar
  só guarda arquivo do que foi enviado a ele; vídeo salvo é um vínculo (como no canvas),
  sem cópia no R2, e usa a versão que vale do vídeo. Regra única: `source_video` vazio quer
  dizer que o arquivo é do avatar. A tela do ativo é a mesma para os dois; a Origem diz
  "Vídeo gerado", "Vídeo enviado", "Imagem enviada" ou "Áudio enviado".
- Barra superior: a marca é o ícone de rosto (`face`, o mesmo da foto do
  avatar) e o nome, sem cara de botão (sem camada de estado no hover). Sair fica
  só no menu do perfil. Não há rodapé.
- Celular (até 599 px): só duas vistas (cards dois por linha e Detalhes, este só
  com Texto e Status); os chips numa linha só que rola para o lado; a
  configuração sem o card branco e sem a sobra embaixo do botão, os campos na
  largura toda; na página do vídeo (mídia do M3), o vídeo num contêiner de cantos
  de 16 px sobre a superfície da página, no formato dele e com no máximo 56% da
  altura da tela, a barra do player logo abaixo, sem faixa escura, sem as setas e
  sem o cabeçalho da folha; sem vídeo pronto, um card compacto com o status (e o
  motivo da falha, que então não se repete na folha); o FAB "Novo vídeo" preso no
  canto.

## Contas

- Contas e sessões vêm do estuda.mais (github.com/gilveloso1/estuda.mais,
  `src/auth.ts`). Antes de mexer em login, convite ou permissão, leia o
  original e porte de lá.
- Permissões sempre conferidas no servidor; teste novo para cada caso de
  acesso negado.

## Modelos: uma estrutura para cada

- Cada modelo de vídeo é uma estrutura em `src/structures/` (hoje `wan.ts`,
  `heygen.ts`, `seedance.ts` e `aleph.ts`; os dois últimos com o campo Uso, hoje só a troca de avatar): campos do formulário, prompt de sistema, montagem do pedido,
  regra de custo, se o áudio passa pelo contêiner e se o vídeo pronto tem o
  botão "Edição rápida" (`quickEdit`, `container/editar.py`). A tela inicial tem um card
  por modelo e uma aba com os vídeos de todos (`/videos`). As telas estão em
  "Telas aprovadas", acima. O nome do site é "Meu Avatar".
- Cada vídeo guarda a estrutura que o gerou (`videos.structure`) e as
  configurações próprias dela (`videos.settings`, JSON).
- Modelo novo é estrutura nova, sem mexer nas outras. O Wan fica como está.
  Estrutura em teste usa `access: "admin"` (só o administrador vê).

## OpenRouter

- Gerar vídeo gasta créditos. Testes usam a API falsa (`test/helpers.ts`);
  chamada real ao `POST /api/v1/videos` só com autorização do usuário.
- Os valores aceitos (duração, resolução, formato, preço) vêm de
  `GET https://openrouter.ai/api/v1/videos/models`; não fixe listas no código.
- O que está sendo testado fica em [docs/modelos/](docs/modelos/README.md): um
  arquivo por modelo, com uso, estado (no ar, em teste, bloqueado, descartado),
  o que se viu e o custo real, e o resumo no README. Leia antes de escolher um
  modelo e atualize depois de cada teste, bom ou ruim, no mesmo PR. Modelo que o provedor bloqueia para um uso
  não é contornado nem apagado: a estrutura fica e ganha a nota lá.

## Migrations e deploy

- O Claude roda as migrations e publica **sempre depois de pedir autorização**
  ao usuário no chat. A autorização vale só para aquela vez.
- Ordem: primeiro `npm run db:migrar`, depois `npm run deploy`.
- Branch novo sempre a partir do `main` do GitHub (`git fetch` e
  `git checkout -b <nome> origin/main`). Antes de publicar de um branch,
  confira que `git log HEAD..origin/main` sai vazio.
- Use `< /dev/null` no fim dos comandos do wrangler que pedem confirmação.
- No computador: `.dev.vars` com `AMBIENTE=local` (esconde avisos de configuração e,
  sem chave, lê a lista pública de modelos para o formulário mostrar todas as
  opções) e, se o usuário quiser, a chave do OpenRouter. O contêiner não roda sem
  Docker (`wrangler dev --enable-containers=false`). `npm run exemplos` põe vídeos
  de exemplo no banco local. Os testes zeram `AMBIENTE` e a chave
  (`vitest.config.ts`).
- Neste ambiente cloud, o `fetch` do Node só passa pelo proxy com
  `NODE_USE_ENV_PROXY=1` (para `npm run gerar`).
