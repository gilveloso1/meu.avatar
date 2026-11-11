# meu.avatar

Estúdio de vídeos curtos com avatar realista falando, para redes sociais e
anúncios. Worker do Cloudflare com D1 e R2; os vídeos vêm da API de vídeo do
OpenRouter. Segue o mesmo molde do anb.bot (github.com/gilveloso1/anb.bot).
Como publicar e operar: [docs/operacao.md](docs/operacao.md).
O que falta fazer, em ordem: [docs/backlog.md](docs/backlog.md). Ao concluir um item, atualize o
backlog no mesmo PR, antes do merge: tire o que ficou feito e corrija o que ficou desatualizado. API e MCP para agentes
editarem projetos: [docs/api.md](docs/api.md); o que cada teste real de um agente mostrou:
[docs/agente-avaliacoes.md](docs/agente-avaliacoes.md). Como o prompt
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
  com o usuário. Exceção combinada (08/11/2026): o detector de rosto do MediaPipe, em versão fixa
  pelo jsDelivr (`MEDIAPIPE`, `src/site/site.ts`), que só baixa quando há rosto a procurar.
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
  - Card de linhas (ícone, rótulo, valor): `detailsCard`, nos Detalhes do vídeo e do ativo e nos cards de lista do painel.
  - Escolher um avatar: `avatarPicker` (busca e lista), em `avatarDialog` (diálogo básico do M3, em
    "Salvar no avatar") e em `assetPanel`.
  - Avatar e ativos no modelo: `assetList` no painel e `assetPanel`, o menu que desdobra colado nele.
  - Texto com emoções (modelos de fala): `speechEditor`, o campo contornado que aceita as emoções em destaque (chip de entrada, com x); `#` abre a lista (`EMOTIONS`, `src/structures/voz.ts`, em português na tela e em inglês no formulário e para o agente), com as mais usadas no topo (contadas no `localStorage`, `emocoes-usadas`) e as outras em ordem alfabética.
  - Voz pronta: campo `voice` no painel, escolhida em `voicePanel`, no mesmo menu (busca, idioma, gênero e prévia); as vozes vêm de `/vozes/lista`, só as do filtro.
  - Pastas (nos ativos do avatar, na aba Vídeos e em Projetos; simples, sem pasta dentro de pasta): um
    componente só, que recebe onde ficam as pastas da lista (`FolderUi`: endereços, nomes, contagem e se apagar
    a pasta pode apagar os itens). Cada pasta é um item da própria lista, antes dos outros e fora do contador:
    `folderItems` (pelo `first` do `library`: o mesmo card e a mesma linha, com o ícone de pasta no lugar da
    imagem) ou, em Projetos, um `tileCard`. `newFolderButton` é o "Nova pasta"; `folderLead` traz o caminho da
    pasta aberta (`.crumbs`, com renomear e apagar) e os diálogos; `moveDialog` é o "Mover para". O menu do item
    (`[data-item-menu]`, botão direito; nos cards, `act` do `MenuItem`) e arrastar ficam no `SCRIPT`, pelo
    documento; o que pode ser movido leva `data-move`, e onde pode cair, `data-drop`. Lista nova com pastas é
    um `FolderUi` novo, não outra cópia.
  - Confirmação de apagar: `.confirm`; estado vazio: `emptyState`, que também é a página de não encontrado
    (`notFoundPage`): todo 404 em texto aberto pelo navegador vira essa página, a mesma para o que não existe
    e para o que é de outra conta.

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
  por dentro). Nele, "Avatar" (aprovado em 01/11/2026): primeiro o avatar, depois
  "Adicionar ativo" (este desde 07/11/2026 com ou sem avatar). Os dois desdobram, colado ao
  painel (2 px, sem sombra), um menu só dos tipos que o modelo aceita (os campos da estrutura, um
  de cada tipo): o do avatar com os ativos dele (sem função presa ao ativo; com um avatar
  escolhido, tocar na linha dele reabre os ativos); o "Adicionar ativo" com "Enviar arquivo" e
  tudo o que a pessoa gerou, de todos os modelos, com "Mostrar mais" (nunca os ativos do avatar).
  Cada escolha se acumula no painel, uma por tipo, venha de onde vier; trocar de avatar só tira o
  que veio do avatar anterior. Um vídeo ou imagem pronto da própria pessoa também entra
  arrastado da lista do centro para o painel. Imagem copiada entra como envio ("Imagem colada"):
  pelo quadro "Colar imagem" ao lado de "Enviar arquivo" (só aparece quando há imagem copiada, o
  que o navegador só conta com a leitura liberada; sem imagem, nem quadro nem aviso), pelo menu do
  botão direito em "Adicionar ativo" (com imagem ou antes de liberar a leitura, que o toque pede) ou
  com Ctrl/Cmd+V fora dos campos de texto. O mesmo menu tem "Usar imagem recente", "Usar vídeo
  recente" (um item por tipo que o modelo aceita): o mais recente daquele tipo que a pessoa gerou no
  próprio modelo, se ele gera o tipo e já gerou algum; senão, dos modelos que geram o tipo. Sem nada a
  oferecer, o botão direito abre o menu do navegador. O bloco Fala tem a voz ou o idioma primeiro e o campo
  "Texto" (cresce com o texto, como o Movimento); no fim, a estimativa (Duração
  e Custo estimado, linhas com ícone) e o "Gerar vídeo" na largura toda, sem
  fixar, com espaço sobrando embaixo. No centro, a lista de vídeos.
- Lista de vídeos (`videoLibrary`, a mesma na página do modelo e em `/videos`):
  cards quadrados sem texto, só a imagem (cantos de 16 px e a sombra de nível 1
  do M3, sem moldura branca), o vídeo preenchendo o quadrado; vistas em grupo de botões
  conectados (cards pequenos, médios, grandes e Detalhes, uma linha por vídeo
  com colunas); chips de filtro por status, chip de ordem e chip "Agrupar por
  data" (desligado por padrão). Tudo no navegador, sem recarregar, e guardado
  no `localStorage` por lista (`lista-<modelo>`, `lista-videos`). A lista vem em páginas de 60
  (`LIST_PAGE`, pedido de 10/11/2026): no fim, a paginação do painel (`pager`: "61–120 de 150" e as
  setas), que troca a página sem recarregar (o que está escrito no painel fica) e leva a página no
  endereço (`?pagina=`); o contador do título é o total, e filtro, ordem e agrupamento valem para a
  página aberta. Só a aba Vídeos tem pastas (pedido de 11/11/2026, `account_folders` e
  `videos.folder_id`; as páginas dos modelos seguem mostrando tudo): "Nova pasta" ao lado de "Novo
  vídeo"; a pasta é um item da lista, antes dos vídeos, só na primeira página; aberta (`?pasta=`),
  mostra só os vídeos dela, com o caminho de volta; mover é arrastando o vídeo para a pasta, pelo
  "Mover para" do botão direito ou pelo da página do vídeo (abaixo de "Salvar no avatar"); a busca
  procura em tudo, sem pastas. Apagar a pasta devolve os vídeos à lista (vídeo gerado não se apaga
  no site). Miniatura só
  baixa quando aparece na tela e enquadra o rosto (`videos.face`; sem rosto, o terço de
  cima). Quem acha o rosto é o navegador de quem vê (MediaPipe, `data-face-find`), uma vez por
  arquivo, e guarda no site; a prévia da Edição rápida também. O servidor não procura (ligava o
  contêiner por cada arquivo novo): só o `rosto` do agente, quando pedido, e a edição sem rosto guardado. Imagens e vídeos dos
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
  em Informações, o campo Nome (salva ao sair dele, sem recarregar; vazio, as listas e o
  `listar_arquivos` mostram a fala), Texto (com Copiar), os textos livres (Movimento, Instruções
  extras) em bloco próprio e Detalhes no card de linhas (ícone, rótulo, valor);
  abaixo de "Salvar no avatar", "Usar para gerar" (só quando a página foi aberta de um modelo,
  `?de=/modelo/<id>`, que aceita o tipo; volta a ele com o arquivo no painel, `?usar=gerado:<id>`);
  embaixo, Refazer (volta ao modelo exatamente como foi gerado, `?refazer=<id>`: o avatar e cada
  arquivo pelo caminho em que entrou, guardado em `settings.ativo_<tipo>`: o mesmo ativo do avatar,
  o mesmo vídeo ou imagem gerado ou o arquivo enviado com o nome dele; se o ativo foi apagado, ou o
  vídeo é de antes disso, a cópia que o vídeo guarda) e
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
  criar no clique). Os ativos se organizam em pastas simples, sem pasta dentro de pasta (pedido
  de 10/11/2026, `folders` e `avatar_assets.folder_id`): "Nova pasta" ao lado de "Adicionar
  arquivo"; a pasta fica na mesma lista dos ativos, antes deles, com o ícone de pasta no lugar da
  imagem; tocar abre a pasta (`?pasta=`), com o caminho de volta e os botões de renomear e apagar;
  mover é arrastando o ativo para a pasta (ou para "Ativos", no caminho) ou pelo "Mover para" do
  botão direito e da página do ativo; o arquivo enviado de dentro de uma pasta fica nela. Apagar a
  pasta pergunta dos itens: "Apagar tudo" apaga os itens junto; "Manter os itens" os devolve à
  lista. "Salvar no avatar" fica abaixo de Detalhes e abre o diálogo com busca;
  o Novo avatar desse diálogo leva o vídeo junto (`?video=`), salvo com o avatar. O avatar
  só guarda arquivo do que foi enviado a ele; vídeo salvo é um vínculo (como no canvas),
  sem cópia no R2, e usa a versão que vale do vídeo. Regra única: `source_video` vazio quer
  dizer que o arquivo é do avatar. A tela do ativo é a mesma para os dois, com o mesmo campo Nome da página do vídeo (`nameField`;
  no ativo, vazio não muda o nome); a Origem diz
  "Vídeo gerado", "Vídeo enviado", "Imagem enviada" ou "Áudio enviado".
- Projetos (`/projetos`): cards como os de Modelos. Tem pastas desde 11/11/2026 (`account_folders` e
  `projects.folder_id`), no mesmo molde: "Nova pasta" ao lado de "Novo projeto"; a pasta é um card
  da grade, antes dos projetos, com o ícone de pasta; aberta (`?pasta=`), mostra só os projetos
  dela, e o projeto criado ali fica nela; mover é arrastando o card para a pasta ou pelo "Mover
  para" do menu do card. Apagar a pasta pergunta dos projetos: "Apagar tudo" os apaga junto;
  "Manter os itens" os devolve à lista.
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

- Painel do administrador (`/painel`, pelo item "Painel" do menu do perfil; 404 para quem não é
  administrador): abas que são links (Visão geral em `/painel`, Custos em `/painel/custos`,
  Contas em `/painel/contas` (convidar, link de nova senha, suspender, testador e Canvas; sem os chips),
  Atividade em `/painel/atividade`: as três máquinas agora (`src/maquinas.ts`, lido do próprio
  contêiner, sem ligar), falhas com o motivo técnico, tokens e o alarme) e os
  chips de período (7 dias, 30 dias, tudo) valendo para todas. Regras de layout (da skill dataviz e
  do M3): um número herói por tela (`.stat-card--hero`, display-large) e os outros em
  display-small, e cada aba abre com essa fileira de números; o card não estica para igualar
  alturas (M3: o tamanho vem do conteúdo): quando um card alto fica ao lado de dois, é um mosaico
  (`.dash__mosaic`, o alto em duas linhas da grade) e as bases se alinham pela grade; a Visão geral
  tem linhas contadas (até 5 modelos e "Outros"; listas inteiras ficam
  numa aba); parte de um todo em barras horizontais ordenadas (`.rank`, uma cor só, "Outros" em
  cinza; em Custos, uma linha por modelo com as colunas alinhadas, para não esticar só a barra).
  Custos também lê os custos de fora (`src/custos.ts`): um card igual por provedor de vídeo
  (OpenRouter, HeyGen; provedor novo é mais um item em `createCosts`, `src/index.ts`) com o
  **saldo** e o **gasto no período** em destaque (o que mais importa ao dono) e, embaixo, o gasto
  total da conta e o limite da chave, sempre rotulado como limite, nunca no lugar do saldo; e a
  Cloudflare (contêineres e R2) num card só. Toda tela de dados passa pelo checklist de
  [docs/layout.md](docs/layout.md) antes do PR (largura toda, dois painéis com título parado e corpo que rola, cards que nunca rolam, paginação).
  Para simular volume: `npm run exemplos:painel`.

## Contas

- Contas e sessões vêm do estuda.mais (github.com/gilveloso1/estuda.mais,
  `src/auth.ts`). Antes de mexer em login, convite ou permissão, leia o
  original e porte de lá.
- Permissões sempre conferidas no servidor; teste novo para cada caso de
  acesso negado.
- O que cada conta pode fazer passa sempre por `pode(conta, permissão, recurso?)`
  (`src/permissoes.ts`, no molde do TabNews), nunca por `role === "admin"`. O papel é um
  pacote de permissões no código; cada conta pode ter ajustes em `users.permissoes` (a mais,
  ou a menos com "-"; "suspensa" tira a conta do site). Permissão nova entra no catálogo e no
  pacote, com teste dela dada e tirada (`test/permissoes.test.ts`).
- Os dados de cada conta saem da `ContaDb` (`db.conta(userId)`, `src/db.ts`): toda consulta
  leva o dono. O banco recusa vídeo sem dono (`migrations/0018_dono.sql`).
- Arquivo enviado (ativos, projetos, MCP) só de uma lista fechada de tipos (`MEDIA_TYPES`,
  `src/arquivos.ts`), nunca qualquer `image/*`: SVG e HTML levam script e são servidos pelo endereço
  do site. Todo arquivo do R2 sai pelo `object()`, com `nosniff` e CSP com `sandbox`.
- O agente envia arquivo sem base64 (ele não consegue montar): por url (o site baixa) ou pelo link de
  envio (`/envio/<código>`, `src/ativos.ts`), a única rota que recebe arquivo sem token nem
  sessão. Ela abre um arquivo para um avatar ou para um projeto só, uma vez, por 30 min; regra nova
  ali ganha teste em `test/avatares-agente.test.ts`.
- O agente apaga projeto só em dois passos (`apagar_projeto`: mostra o que sairia e devolve um
  código; só apaga com ele em `confirmacao`, depois do sim da pessoa). Outra ferramenta que apague
  segue o mesmo molde.
- O MCP tem um teto de contexto fixo (as instruções e a lista de ferramentas vão em toda conversa):
  na descrição fica só o que o agente precisa para montar a chamada; regras e casos vão para a
  ferramenta `ajuda` (`AJUDA` e `COMANDO`, `src/mcp.ts`). `test/mcp.test.ts` segura o teto.
- A exportação pronta tem um link de download sem token nem sessão (`/baixar/<exportação>/<código>/...`,
  `BAIXAR_PATH` em `src/exportar.ts`): o agente baixa no terminal, que não tem o token. Só lê, só aquela
  exportação e só por 1 hora depois de entregue (perguntar de novo renova); regra nova ali ganha teste em `test/canvas.test.ts`.
- O que o agente vê dos arquivos sai de um item só (`src/acervo.ts`): `listar_arquivos`, os ativos do
  `listar_avatares` e os arquivos do `ver_projeto`. O painel Arquivos do canvas lê o mesmo acervo
  (`projectLibrary`, `src/site/site.ts`). Fonte nova de arquivo é mais uma consulta ali, com o
  mesmo item e a mesma página (`Pagina`, `src/db.ts`), nunca uma lista à parte.
- Todo download (vídeo, imagem, ativo, arquivo de projeto, exportação) tem o mesmo nome: o da tela,
  sem mudança, e a extensão do tipo real (`downloadName` e `contentDisposition`, `src/arquivos.ts`).
  Download novo passa por elas; nada de montar nome de arquivo à parte.

## Modelos: uma estrutura para cada

- Cada modelo de vídeo é uma estrutura em `src/structures/` (hoje `wan.ts`, `wan-livre.ts` (o Wan 3.0
  com tudo o que aceita, para o agente; versão "Livre" do Wan, só o administrador),
  `heygen.ts` (e `heygen-direta.ts`, a mesma estrutura pela API direta da HeyGen, que entra no lugar dela quando a plataforma do banco é `heygen`), `omni.ts` (Gemini Omni 1.2 Flash e a versão 1.1, só o administrador), `grok.ts` (cena sem fala), `mischief.ts` (cena sem fala nem som, só 16:9, o mais barato), `imagem.ts` (Nano Banana: imagem, não vídeo, com `output: "image"`; fica na tabela e nas telas dos vídeos, gerada pela API de imagens fora do pedido, num Durable Object com alarme (`src/imagens.ts`), para não ficar presa se o navegador sair da página e fora da aba Vídeos; o agente acha as imagens no `listar_arquivos` (`tipo: imagem`), gera pelo `gerar_imagem` do MCP e põe no canvas com `adicionar {imagem}`), `voz.ts` (modelos de fala, hoje o ElevenLabs v4 e o Fish Audio Drama 3, este só com as vozes oficiais do Fish (`src/fish.ts`, lidas do Fish e guardadas por um dia, como o catálogo da HeyGen) e com a Voz clonada no molde da HeyGen (a gravação vai em cada pedido; `voices.provider = 'fish'`): áudio, com `output: "audio"`, pelo mesmo caminho da imagem e com a mesma página; o menu de vozes é o do HeyGen, por `?modelo=`, e o áudio entra no HeyGen como "Meu áudio" pelo "Adicionar ativo"; o agente gera pelo `gerar_audio` do MCP (vozes de `listar_vozes` com `modelo`), acha no `listar_arquivos` (`tipo: audio`) e põe no canvas com `adicionar {audio}` ou no `gerar_video {audio}`), `seedance.ts` e `aleph.ts`; os dois últimos com o campo Uso, hoje só a troca de avatar): campos do formulário, prompt de sistema, montagem do pedido,
  regra de custo, se o áudio passa pelo contêiner e se o vídeo pronto tem o
  botão "Edição rápida" (`quickEdit`, `container/editar.py`). A tela inicial tem um card
  por modelo e uma aba com os vídeos de todos (`/videos`). As telas estão em
  "Telas aprovadas", acima. O nome do site é "Meu Avatar".
- Cada vídeo guarda a estrutura que o gerou (`videos.structure`) e as
  configurações próprias dela (`videos.settings`, JSON).
- Modelo novo é estrutura nova, sem mexer nas outras. O Wan fica como está.
- O agente usa os modelos pelo MCP sem ferramenta por modelo: `listar_modelos` e um `gerar_*` por tipo
  (vídeo, imagem, áudio), com `modelo` obrigatório (sem padrão) e em dois passos (simula e mostra o
  custo; só gera com a `confirmacao`, depois do sim da pessoa). Quem descreve o modelo para o agente é
  a estrutura (`agent`: quando usar, campos e `values`); sem `agent`, o modelo fica só no site.
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
- Nada de imagem, vídeo ou áudio no repositório (nem de teste, nem de exemplo): pesa o projeto
  para sempre. Resultado de teste fica no site (projeto ou lista do modelo) ou no R2, e o doc
  diz onde (id ou caminho).
- Arquivo temporário ou de trabalho (download, saída de teste, material de referência, script
  avulso) vai para `temp/`, na raiz do projeto, que fica fora do git (`.gitignore`). Nunca na raiz
  nem em outra pasta do projeto.

## Quando o usuário precisa agir

Alguns passos só o usuário pode fazer: criar um token, entrar numa conta, aprovar algo num painel,
colar um segredo no terminal, mudar uma configuração fora do repositório. Nesses casos:

- Parta da premissa de que ele não sabe como fazer. Antes de qualquer instrução, pergunte se ele
  quer o passo a passo, com botões (por exemplo "Sim, me guie" e "Já sei fazer").
- Vale também no fim de um trabalho ou relatório: se sobra algo para ele fazer, diga o que é e
  por quê, numa frase, e pergunte se quer ser guiado. Não escreva o "como fazer" no relatório.
- Antes de pedir a ação, confirme o que falta de verdade (leia o estado, os logs, o que já está
  feito): não mande o usuário refazer o que pode já estar pronto.
- Com o passo a passo, mande **um passo por mensagem**, numerado ("Passo 2 de 5"). Nunca mande a
  lista inteira de uma vez.
- Cada passo diz exatamente onde tocar e o que escrever: o link direto da página, o nome do botão
  como aparece na tela, o texto a digitar e o comando num bloco `bash`.
- Termine cada passo com uma pergunta e botões: "Pronto" e uma saída, como "Não achei" ou "Deu
  erro". Espere a resposta antes do passo seguinte.
- Se não souber o nome exato de algo na tela, diga isso e peça para ele contar o que aparece,
  antes de escolher.
- Segredo nunca passa pelo chat: o usuário cola direto onde ele vai (terminal, painel), e você
  avisa isso no passo.
- Confira o resultado você mesmo quando puder (por exemplo, lendo o terminal) em vez de pedir que
  ele descreva. No fim, diga que deu certo e qual é o próximo passo do trabalho.

## Migrations e deploy

- O Claude roda as migrations e publica **sempre depois de pedir autorização**
  ao usuário no chat. A autorização vale só para aquela vez.
- Ordem: primeiro `npm run db:migrar`, depois `npm run deploy`.
- Publicar é sempre numa sessão cloud, no ambiente "Meu Avatar" (nunca o padrão
  da conta, "ANB Bot"): o computador do usuário não tem Docker, e o deploy monta
  as imagens dos contêineres. De uma sessão local, faça o merge e mande uma
  sessão cloud publicar o `main`, dizendo no pedido que o usuário autorizou.
  Quando `container/` mudar, confira que o digest da imagem mudou, não só a
  versão do Worker. Exceção: quando nem `container/` nem a imagem de render mudam, dá para
  publicar daqui só o Worker, sem Docker: `npx wrangler deploy --containers-rollout=none < /dev/null`
  (os contêineres seguem como estão; usado em 04/11/2026). Sempre com autorização.
- `MEU_AVATAR_TOKEN` no ambiente é o token do administrador para o MCP
  (`https://meuavatar.ia.br/mcp`, `Authorization: Bearer`). Depois de publicar
  algo que o MCP usa, confira no ar com uma chamada de verdade (as que não
  gastam créditos: listar, ver, quadros, silêncios). Nunca mostre o valor.
- Branch novo sempre a partir do `main` do GitHub (`git fetch` e
  `git checkout -b <nome> origin/main`). Antes de publicar de um branch,
  confira que `git log HEAD..origin/main` sai vazio.
- O merge de um PR só com a autorização do usuário no chat, pedida a cada vez (como o deploy):
  publicar não autoriza o merge.
- O merge dos PRs é o merge comum ("Create a merge commit"), nunca squash nem rebase: com squash,
  o branch fica com commits que o `main` não reconhece e o próximo envio exige sobrescrever o
  branch (09/11/2026, PRs 135 a 137).
- Use `< /dev/null` no fim dos comandos do wrangler que pedem confirmação.
- No computador: `.dev.vars` com `AMBIENTE=local` (esconde avisos de configuração e,
  sem chave, lê a lista pública de modelos para o formulário mostrar todas as
  opções) e, se o usuário quiser, a chave do OpenRouter. O contêiner não roda sem
  Docker (`wrangler dev --enable-containers=false`). `npm run exemplos` põe vídeos
  de exemplo no banco local; `npm run exemplos:painel` põe volume (contas, 900 vídeos, projetos,
  exportações, avatares) para simular o painel, e `-- --limpar` tira. Os testes zeram `AMBIENTE` e a chave
  (`vitest.config.ts`).
- Neste ambiente cloud, o `fetch` do Node só passa pelo proxy com
  `NODE_USE_ENV_PROXY=1` (para `npm run gerar`).
