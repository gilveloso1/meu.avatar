# Canvas de edição

O que o dono descreveu (29/10/2026) e o que já está no site.

## Ideia

Um canvas infinito por projeto, como o Figma, onde a pessoa monta vídeos com
blocos. Cada bloco é gerado uma vez e entra em quantas versões ela quiser: as
variações saem das conexões, não de gerar de novo. Menos tempo de edição e
menos custo.

## Peças

- **Projeto**: um canvas infinito (arrastar, zoom). Cabe qualquer arranjo:
  blocos soltos, vários grupos, várias conexões e vários blocos finais.
- **Bloco**: vídeo, imagem, áudio etc., gerado aqui ou importado. A largura é
  a duração; dá para encurtar no começo e no fim.
- **Rascunho**: o lugar de um vídeo que ainda não existe, com a fala, a descrição e a
  duração estimada (comando `rascunho`, [api.md](api.md)). A fala é o que será dito (o agente a
  copia para gerar o vídeo ou o áudio); a descrição, o resto (cena, enquadramento, referências).
  As duas são opcionais: o rascunho pode ficar em branco, ter só uma ou as duas. É um bloco de imagem
  sem arquivo (`draft: {fala, descricao?}`), com o nome Texto 1, Texto 2... (como os blocos;
  muda no campo Nome ou com `renomear`): no canvas mostra a fala ou, sem ela, a descrição (as duas
  editáveis nos Ajustes, a descrição em cima), na prévia um cartão,
  e a exportação espera até ele ser trocado pelo vídeo (`trocar`). Serve para
  montar a estrutura inteira e gerar só os vídeos que faltam.
- **Nota**: texto solto no canvas (briefing, roteiro, referências), um bloco amarelo do tamanho de
  um bloco de vídeo com o texto no lugar do quadro (`notes: [{id, x, y, text}]`, até 10 mil
  caracteres; cor `--bloco-nota-*`, gerada pelo `npm run tema`). Não entra em grupo, ligação nem
  exportação: só anda, duplica e sai. Nasce ao colar ou soltar um texto no canvas; o texto muda nos
  Ajustes. O agente lê as notas no `ver_projeto` (`notas`), cria com `nota {texto, perto?}`, troca o texto com
  `editarNota {nota, texto}` e apaga com `remover {ids}`.
- **Animação em código**: o HTML do agente (elementos, `<style>` e a linha do tempo `tl` do
  GSAP), guardado no bloco (`code: {html}`, comandos `adicionar {html, duracao}` e
  `editarCodigo`, [api.md](api.md)). É um bloco de imagem sem arquivo, como o rascunho, que vai até
  60 s (`CODE_MAX`, o que o render faz de uma vez) e cobre o vídeo como qualquer cobertura; o
  tempo do bloco é o da linha do tempo. Quando a fala de baixo muda de tamanho pelos comandos, a animação
  estica ou encolhe junto: o bloco guarda a `escala`, e o `codeHtml` acrescenta no fim do código um script
  que passa os filhos da `tl` para uma linha interna e muda só a velocidade dela (mudar a de cada filho
  aplicava os `set` na hora); `esticar: false` não deixa. Na prévia, cada animação é uma página própria
  (`/canvas/animacao`, de `src/canvas/animacao.html`) num iframe com `sandbox="allow-scripts"`:
  sem a origem do site, sem rede além das fontes e só posta pelo canvas (`frame-ancestors 'self'`).
  Ela monta a página do render (`container/render/servidor.mjs`) com o mesmo GSAP (3.15.0,
  embutido pelo `npm run canvas`) e as mesmas famílias e pesos, pelo Google Fonts (a versão de
  cada fonte pode diferir um pouco da guardada na imagem). O player manda o código e, a cada
  quadro, o instante (`tl.seek`), só para a que está na tela, no tamanho do Final e reduzida para
  o quadro. Sem resposta em 8 s (código que trava, quadro barrado), a prévia segue sem ela. O
  navegador do app Claude barra iframes com `sandbox`: lá a animação não aparece; no Chrome e
  no Safari, sim. Na exportação, cada animação vira um WebM transparente no contêiner de render
  (`src/exportar.ts`, um passo antes dos trechos), no tamanho e na duração do Final, guardado em
  `animacoes/<hash>.webm` pelo código, pelo tamanho e pela duração: a mesma animação não
  renderiza duas vezes, nem entre exportações, e só renderiza a que um trecho ainda por fazer
  usa. No trecho, ela entra como qualquer vídeo transparente sem som. Os parâmetros (`code.params`,
  [api.md](api.md)) aparecem nos Ajustes, um campo de texto por chave: trocar o valor muda a
  prévia e faz outro vídeo na próxima exportação, sem mexer no código.
- **Juntar**: blocos encostados lado a lado formam uma sequência fixa (corte
  seco), como numa linha do tempo. Juntos, viram um grupo.
- **Buraco no bloco** (pedido do dono, 11/11/2026): apagar um elemento do meio de um bloco não o
  parte em dois: os que ficam continuam no mesmo bloco, com o espaço vazio, para arrastar os outros
  ou pôr um novo ali. Os elementos que ficam levam a mesma marca (`joint`, `removeKeeping` em
  `modelo.js`), e `groups` junta quem tem a mesma marca na mesma altura; o elemento solto fora do
  bloco perde a marca, e o que encaixa num bloco marcado a ganha. Enquanto o buraco estiver na
  sequência de vídeo, aquele trecho sai sobre fundo preto (o aviso `sem_video_de_base` do agente).
  Pelos comandos do agente nada mudou: `remover` com `fechar` encosta, e sem ele o grupo se parte.
- **Sobrepor**: um bloco em cima de outro cobre a imagem dele naquele trecho,
  como um corte para o b-roll; arrastar para os lados escolhe o momento. Um
  b-roll também pode ficar entre dois blocos, como trecho próprio.
- **Som**: em qualquer bloco, tirar o som, manter, sobrepor (música, narração)
  e ajustar o volume. O resultado é o que a pessoa arrumou.
- **Conectar (linhas)**: a linha liga uma parte à seguinte e é o que cria
  variações. Elas se multiplicam: 3 ganchos ligados a um corpo, e o corpo a
  2 CTAs, dão 3 × 2 = 6 vídeos.
- **Bloco final**: recebe as linhas e mostra as variações possíveis. Exporta
  todas ou só uma.

## Regras

- Só os originais (blocos) ficam no banco. As variações não são salvas: são
  montadas na exportação e ficam 24 horas para baixar. Para usar uma variação como bloco, a pessoa importa
  o vídeo exportado.
- Montar não chama modelo de vídeo: é ffmpeg no contêiner (custo quase zero).
  Gerar um bloco segue as estruturas de `src/structures/`, com o custo antes.
- O canvas tem de atender a essas exigências antes de qualquer escolha de
  construção (código próprio ou biblioteca, a combinar com o dono).

## Construção e visual (29/10/2026)

- **Código próprio**, sem biblioteca (DOM e SVG, como o resto do site), escolhido
  pelo dono depois de comparar com o tldraw. O protótipo está em
  [prototipos/canvas/](../prototipos/canvas/README.md).
- **A interface segue o M3 onde for possível**: os componentes são os do site
  (`src/site/style.ts`: barra superior, botões, campos contornados, barra do
  player, folha lateral de 400 px, snackbar) e os que faltavam seguem as specs
  do M3 Expressive (switch, diálogo básico, tooltip simples, barra de
  ferramentas flutuante, lista expressiva). O que é só do canvas (blocos,
  portas, linhas) usa os tokens do M3: forma, elevação, tipografia e estados.
- **Visual e cores do M3.** Blocos do mesmo tipo têm a mesma cor e variam no tom
  para diferenciar: vídeo na paleta primária, imagem na secundária, áudio na
  terciária, 6 tons cada (`--bloco-<tipo>-<1 a 6>` e `--bloco-<tipo>-on`,
  gerados por `npm run tema`). O mesmo arquivo repete o tom; arquivo novo pega
  o tom menos usado do tipo. O bloco final vai em primary.
  Os quadros do vídeo e a imagem aparecem na cor do bloco (só a luz deles fica);
  com o mouse em cima ou escolhido, nas cores de verdade.

- **Começo**: o canvas vazio não tem Final. O primeiro elemento que entra traz o Final, já
  ligado a ele; os seguintes ficam soltos.
- **Ligações**: puxa-se de um ponto de saída para uma entrada, ou de uma entrada para uma
  saída. Puxar a linha solta a ponta mais perto: num ponto ela liga de novo, no vazio ela
  some. Clique na linha e Delete apaga. `linkProblem` (`modelo.js`) recusa ligar um grupo a
  ele mesmo, repetir uma ligação, fechar um círculo e passar do limite de variações.
- **Trilhas**: todo elemento segue as mesmas regras (`snap`, `trackIn`, `freeTrack` em
  `modelo.js`); só a área muda. Vídeo, imagem e, no futuro, legenda ficam na área de vídeo, com
  a trilha 0 embaixo e as outras subindo; sons ficam na área de som, com a trilha 0 em cima e
  as outras descendo. Uma trilha pode ter um elemento ou vários, e nada se sobrepõe nela: o
  elemento vai para a trilha livre mais perto do mouse, e a seguinte à última está sempre livre.
  Qualquer elemento é puxado pelo ímã (24 px na tela, para puxar e para soltar, desde 11/11/2026:
  eram 48 e 96, e o bloco saltava de longe e ficava preso; o vídeo que vem por baixo, pela área de
  som de um bloco, só entra ao chegar à área de vídeo), corre até a própria ponta sair do bloco, que
  cresce junto, e encosta nas pontas dos outros. Passou da direita, fica ao lado, na primeira trilha;
  passou da esquerda, sai do bloco. O bloco o segura numa área maior e, perto da trilha onde
  está, ele fica nela, para nada piscar. Alt solta sem encaixar. O tempo de cada elemento vem
  só da posição dele; quem está em trilha mais alta fica por cima.
- **Sequência** (09/11/2026): a de um elemento é a trilha dele no bloco, a mesma regra para todo tipo
  (`sequence` e `base`, `modelo.js`). A base é a trilha 0 de vídeo ou, num bloco só de som, a trilha 0
  de som: as falas de áudio encostadas são a base desse bloco, e o que está nas outras trilhas (a música
  embaixo, a imagem por cima) acompanha o ponto da fala. Quem entrou primeiro no bloco diz a base (`soundFirst`): imagem com
  som embaixo e vídeo com música embaixo têm a mesma geometria; se o primeiro foi a fala, a imagem da
  trilha 0 de vídeo é cobertura. Fora da base, a sequência é a cadeia dos que
  encostam um no outro naquela trilha. O aparar da tela e os comandos (inserir depois, mover, cortar,
  velocidade, tirar pausas e trechos) passam por ela.
- **Som do vídeo**: vai na área de som (`g.sounds`), anda junto com o vídeo e pode mudar de
  faixa puxando por ele (`lane`, `setLane`). Se a faixa pedida estiver ocupada, fica na mais
  perto com lugar. `upgrade` acerta projetos antigos, em que o som de quem estava por cima
  ficava entre a imagem e a sequência.
  Vídeo sem faixa de som (o WebM do render, uma animação) entra com `audio: "none"`, sem essa
  camada: o servidor lê o cabeçalho do arquivo (`src/som.ts`) no envio e no `adicionar`. Os
  blocos que já estavam no canvas não mudam.
- **Exceções, e por quê**: só som tem limite de faixas (`MAX_FAIXAS`, a exportação soma todos);
  som solto não tem área de vídeo, então o conector dele fica na altura dele; a prévia junta as
  trilhas de vídeo acima da base numa camada, e nela mostra todas as do instante, empilhadas pela
  trilha (09/11/2026): a animação é transparente e deixa ver a imagem de baixo, como na exportação.
- **Sem saltos e fácil de pegar** (11/11/2026, do teste de uso com medições, aprovado pelo dono):
  - A linha de reprodução só se pega pela alça de cima; a linha em si não recebe o clique, para não
    cobrir a borda de corte do começo do bloco.
  - No bloco escolhido, o tocar surge no lugar do ícone do tipo, no rótulo, com a mesma largura e
    altura (é o próprio ícone que vira o botão); o bloco inteiro arrasta.
  - Puxar pela faixa de som só muda a faixa: o vídeo não sai do lugar.
  - Soltar um grupo ou o Final em cima de outro elemento o leva ao lugar livre mais perto (`settle`,
    `canvas.js`); com Alt, fica onde foi solto. O que entra pelo painel Arquivos ou pelo envio cai num
    lugar livre do que está à vista (`findSpot`), sem mexer na vista; sem lugar, a vista se afasta até
    mostrar tudo.
  - "Organizar" termina com "Ver tudo". Abrir e fechar o painel Arquivos não desloca o que está no canvas.
  - O tamanho de cada coisa com o zoom segue o sistema de proporção, abaixo.
  - A ligação solta a até 32 px de um ponto liga nele; no vazio, um aviso diz que não ligou (a linha
    puxada de uma ligação que já existia some, sem aviso: é o gesto de tirar).
- **Sistema de proporção** (aprovado pelo dono em 11/11/2026; antes cada elemento tinha a sua regra, e
  a 800% o ponto de ligação tinha 144 px ao lado de uma linha de 4). Três famílias, cada uma com uma
  regra só (`scale()` e `stroke()`, `canvas.js`; `--ck`, `--sw` e `--lz`, `tela.html`):
  - **Conteúdo** (blocos, miniaturas, ondas de som, texto do rótulo, card do Final): acompanha o
    zoom por inteiro. Exceção: afastado, o texto do rótulo não fica menor que uns 10 px na tela, e
    abaixo de 75% o rótulo mostra só o nome.
  - **Controles** (ponto de ligação, borda de corte, aba do grupo, ícone das áreas): crescem pela
    raiz do zoom, de 1 a 2 vezes, e afastados não ficam menores que a 100%. Ponto de ligação: 18 px
    até 100%, 26 em 200%, 36 a partir de 400%.
  - **Traços** (seleção, contorno do grupo, divisa das áreas, ligações, guia do corte): a mesma
    medida, em px inteiros: 2 px até 100%, 3 em 200%, 4 a partir de 400%.
  - **Cursor de progresso** (a linha de reprodução e a alça): atravessa o bloco de cima a baixo e por
    isso segue o tamanho dele mais de perto, nos dois sentidos (pedido do dono, 11/11/2026): o zoom
    elevado a 0,6, de 0,6 a 3,5 vezes. Alça de 12 × 20 e linha de 2 px a 100%; 8 × 13 e 1 px a 50%;
    42 × 70 e 7 px a 800%. A área de toque em volta da alça não encolhe.
  Os traços ficam numa camada fora do canvas ampliado (`#lines`, `drawStrokes`), e a linha de
  reprodução direto no `#vp`: dentro do canvas ampliado, o navegador arredonda para 1 px do canvas
  tudo o que for mais fino (a borda de 2 px saía com 8 em 800%). Traço ou controle novo entra numa
  dessas famílias, sem regra própria.
- **Arrasto leve**: cada arrasto desenha no máximo uma vez por quadro, sem o painel (ele vem
  ao soltar). Sem mudança no lugar do elemento, nada é desenhado; cada elemento, as portas e
  as linhas só tocam a página se algo deles mudou.
- **Nome dos blocos**: Bloco 1, Bloco 2, na ordem em que os elementos entraram; muda nos
  Ajustes (`project.names`, pelo id do primeiro elemento), e vazio volta ao número.
- **Área e prévia**: o grupo ganha um retângulo tracejado em volta de tudo o
  que entra nele (sequência, coberturas e som), com o chip do nome em cima. O
  bloco escolhido tem o tocar no lugar do ícone do tipo; o chip do grupo também tem o seu. A prévia
  toca só aquilo, e uma linha em primary anda sobre o bloco ou o grupo; a
  linha tem uma alça em cima e pode ser arrastada. Tocando, o botão vira pausar.
  Clicar num ponto vazio dentro da área de um grupo escolhe o grupo e leva a linha
  de reprodução até ali; o tocar (ou o Espaço) toca dali.
- **Áudio do vídeo**: todo vídeo com som mostra o próprio áudio numa faixa da área
  de som, na mesma cor e tom do vídeo (corta e anda junto).
  - "Desvincular o áudio" cria uma **cópia** do som como bloco de áudio comum
    (terciária), na mesma faixa e com o mesmo corte, sem ligação com o vídeo; o vídeo
    só deixa de mostrar e tocar o próprio som.
  - No vídeo, "Vincular ao áudio" volta a mostrar e tocar o som dele; a cópia não
    muda (se as duas tocam no mesmo grupo, um aviso diz que o som está duas vezes).
  - No áudio que veio de um vídeo, "Vincular ao vídeo" volta a mostrar o vídeo do
    mesmo arquivo, com o corte e o volume dele, logo abaixo do grupo; o vídeo de
    onde veio não muda.
  - Apagar um não afeta o outro. O som somado tem até 8 faixas embaixo do grupo.
- **Corte**: no bloco escolhido, puxar a borda da esquerda ou da direita (sem
  desenho; o cursor vira a seta de redimensionar). A borda de seleção vai por dentro.
  **Alinhado** (pedido do dono, 11/11/2026): quando a ponta que o corte move chega a 8 px (na tela)
  da ponta de um elemento de outra trilha do mesmo bloco (o vídeo de baixo, a cobertura, o som), o
  corte para exatamente nela, uma guia tracejada em primary (um traço do sistema de proporção) aparece de cima a baixo do bloco e o aviso de cima
  diz "Alinhado": assim não ficam, sem querer, elementos de tamanhos quase iguais. Com Alt, corta
  livre (`trimAlign`, `modelo.js`).

- **Folha da direita**: abas Prévia e Ajustes (abas principais fixas do M3, como na
  página do vídeo), sem título em cima. Na Prévia, o vídeo 9:16 ocupa a altura que
  sobra, com margens de 12 px; nos Ajustes, o título do que estiver escolhido e os
  campos (Final, bloco, grupo, linha). Tocar algo
  (bloco, grupo ou variação) mostra a Prévia; a aba escolhida fica lembrada.
- **Variações no card Final**: cada caminho até o Final é uma variação, numerada na
  ordem das ligações ("Variação 2", o mesmo nome no arquivo exportado; o número muda
  se as ligações mudarem). O card tem até 6 linhas e 8 colunas e usa o maior
  número de linhas que fecha o retângulo (8 = 4 × 2, 15 = 5 × 3, 24 = 6 × 4); sem isso,
  6 linhas e a última coluna incompleta. Com 1 ou 2 colunas, "Variação 1"; com 3,
  "V. 13"; com 4 ou mais, só o número, com a escolhida numa linha em cima. Tocar numa variação toca na Prévia, sem sair do
  canvas, e destaca os blocos e as linhas dela, apagando o resto; o destaque fica
  depois de pausar e sai ao clicar fora do Final. As setas ← e → passam de uma para
  outra, com o Final escolhido. O botão direito no card abre o menu para baixar
  a variação do clique (fora de uma, a escolhida) ou todas, pela mesma exportação; ele não
  toca nem muda a escolhida. Com um bloco, grupo ou linha selecionado, as
  variações em que ele entra ganham um destaque suave no card. Cada Final tem até 48 variações, o mesmo limite de uma
  exportação: a ligação que passaria disso é recusada, com um aviso. Projeto antigo com
  mais ligações mostra as 48 primeiras e o aviso no card.
  Os botões de baixo (Exportar, Duplicar, Excluir) só aparecem na aba Ajustes.
- **Barra de baixo**: desfazer, refazer, zoom, Organizar, Ver tudo e Info, em 48 px. A Info
  abre um tooltip rico do M3 com os gestos, que ficam fora do canvas. A roda do
  mouse com Ctrl dá cerca de 23% por giro, e o zoom anda até lá em alguns quadros.
- **Organizar**: cada grupo numa coluna, depois de tudo o que vem antes dele, e os Finais na
  última. Cada elemento tenta ter o conector na altura do que chega a ele; com uma ligação
  longa, na altura dela. Quem atravessa uma coluna reserva a altura ali, e ninguém fica em
  cima. O teste confere, em vários formatos de projeto, que nenhuma linha passa sobre um
  elemento. Desfazer volta tudo.
- **Linhas**: curva suave. A que passaria sobre um elemento segue reta na altura da saída e
  faz a curva nos últimos 120 px (`linkPath`, `modelo.js`).
- **Zoom no bloco**: dois cliques num bloco ampliam o canvas até ele ocupar a
  largura (a proporção não muda; se não cabe na altura, fica à vista a onda, embaixo).
  O zoom vai até 800%. "Ver tudo" volta. Com zoom, sombras, contornos, linhas, a linha
  de reprodução e o botão de tocar mantêm o tamanho da tela; a onda fica dentro dos
  cantos do bloco.
- **Memória da onda**: de cada áudio fica guardado só um byte por passo de 1/480 s. O bloco
  usa uma onda leve (120 px/s, 40 px de altura); a partir de 300%, o trecho à vista ganha
  a nítida (480 px/s, 80 px), descartada ao sair da tela ou do zoom.
- **Miniaturas**: o quadro do vídeo sai com até 720 px de altura, nítido no zoom de 800%;
  a imagem usa o próprio arquivo.
- **Onda do som**: sem ícone, de borda a borda do bloco, no corte de agora (o x da
  onda é o mesmo tempo do vídeo), para cortar vendo onde a fala começa e termina.
- **Prévia sem tela preta**: cada trecho é um vídeo empilhado no quadro (o
  navegador desenha, sem copiar para canvas); cada um já espera parado no começo
  do trecho; a troca só acontece quando o próximo tem imagem (até lá fica o
  anterior); se um trecho precisa carregar, o relógio da prévia espera por ele.

## No site (em teste)

- **Projetos** (`/projetos`), na barra superior depois de Modelos e Vídeos, só para
  o administrador (para os outros, 404): os projetos da pessoa em cards (o editado
  por último primeiro), com busca pelo nome, "Novo projeto" e, no menu de cada um,
  Abrir e Apagar (com uma página de confirmação; leva o projeto e os arquivos
  enviados para ele, os vídeos não).
- **Canvas de um projeto** (`/canvas/<id>`; `/canvas` sozinho leva à lista): a barra
  tem o nome do projeto, Bloco final e Arquivos (o envio do computador fica no pé do painel Arquivos). Salva sozinho
  pouco depois de cada mudança (`POST /projetos/<id>/salvar`, o canvas em JSON, até
  1 MB); se falhar, um aviso. O nome muda na barra superior (um clique no título; sair do campo salva, Esc desiste) ou
  nos Ajustes, sem nada escolhido, onde também ficam os dados do projeto: criado em,
  modificado em, criado por, blocos e variações.
- **Arrastar e colar**: soltar arquivos em qualquer ponto da página (o canvas mostra o contorno
  enquanto eles passam) faz o mesmo que o "Enviar do computador"; soltar fora do canvas não deixa o navegador
  abrir o arquivo. Colar (Ctrl+V ou Cmd+V) fora de um campo: imagem copiada vira bloco ("Imagem
  colada"), texto vira nota. Entra onde está o mouse; sem ele no canvas, embaixo de tudo. Arquivo que não
  é imagem, vídeo nem áudio: o aviso de sempre. Colar num campo de texto continua normal.
- **Botão direito** (o menu vertical do M3, o mesmo do card Final): em qualquer elemento (bloco, aba
  do grupo, nota, Final), Copiar, Colar, Duplicar e Excluir, com o atalho de cada um; na linha, Colar e
  Excluir; no vazio, só Colar. O elemento do clique fica escolhido. No Final com variações, Baixar vem
  antes. **Colar põe no ponto do clique** (o canto de cima à esquerda do que foi copiado); Ctrl+V, onde
  está o mouse. Copiar (menu ou Ctrl+C) guarda o elemento e põe um resumo (o texto da nota, o nome
  dos blocos) na área de transferência: enquanto ela tiver esse texto, colar põe os elementos; se a
  pessoa copiou outra coisa depois, vale a outra (imagem vira bloco, texto vira nota). O grupo copiado
  continua grupo; linhas não vão junto. Duplicar põe logo embaixo, com "(cópia)" nos blocos. O Colar do
  menu lê a área de transferência pelo navegador, que pode pedir permissão; se não der, o aviso pede o
  Ctrl+V (`copyItems`, `pasteItems` em `modelo.js`).
- **Arquivos** (11/11/2026, no lugar do "Seus vídeos", um diálogo que só trazia os 100 vídeos
  gerados mais novos; aprovado pelo dono no mesmo dia): um painel só para tudo o que a pessoa pode pôr
  no projeto, preso à esquerda do canvas. É a folha lateral padrão do M3 (320 px, rola por dentro):
  convive com o canvas, que encolhe para dar lugar, em vez de cobri-lo como o diálogo (o M3 reserva o
  diálogo para decisão ou aviso que bloqueia; o painel de mídia ao lado é o molde dos editores de
  vídeo). O botão "Arquivos" da barra abre e fecha, e a escolha fica lembrada (`canvas-arquivos`).
  Abaixo de 1200 px de largura o painel passa por cima do canvas. De cima para baixo: o título e o
  fechar; a origem em abas (as da folha da direita): **Gerados** (vídeo, imagem e áudio de todos os
  modelos, com as pastas da aba Vídeos), **Avatares** (primeiro os avatares; dentro de um, as pastas
  e os ativos dele) e **Projeto** (os arquivos enviados a ele, mesmo os que nenhum bloco usa; os de
  outro projeto não entram: a exportação só lê os do próprio); a busca; o tipo em chips de filtro
  (Vídeos, Imagens, Áudios; nenhum marcado é tudo); o caminho da pasta aberta (`.crumbs`); e o
  conteúdo: pastas e avatares em lista, vídeos e imagens numa grade de três colunas de cards quadrados
  com o nome embaixo, áudios em lista. Como nas listas do site, a raiz mostra só o que está fora de
  pasta, e a busca procura em tudo, sem pastas. Com um tipo escolhido, também: aparecem todos os
  arquivos daquele tipo, estejam ou não numa pasta (e, em Avatares, de todos os avatares), sem as
  pastas; sem tipo, as pastas voltam (pedido do dono, 11/11/2026). Os três chips dividem a largura
  do painel. **Arrasta-se o arquivo até o ponto do canvas** em que
  ele entra; tocar também põe, no meio do que está à vista (se ali já houver bloco, desce até um
  lugar livre, e a vista vai até ele). O card do que já está no canvas ganha o selo de camadas.
  **Ver antes de pôr**: com o mouse em cima, o vídeo toca mudo no próprio card; o áudio tem o botão
  de ouvir na linha (um por vez); o card do vídeo e a linha do áudio mostram a duração, lida do
  cabeçalho do arquivo (a mesma que o bloco usa ao entrar, sem ler de novo). **Escolher vários**: o
  círculo no canto do card (aparece com o mouse em cima), Ctrl ou Cmd com o toque ou, já com algum
  escolhido, qualquer toque; o pé do painel mostra quantos são e o "Inserir", que os põe um
  embaixo do outro; arrastar um dos escolhidos leva todos. Sem escolhidos, o pé tem o **Enviar do
  computador** (o botão saiu da barra de cima): o arquivo entra no canvas e na aba Projeto. Vem do servidor em páginas de 24
  (`LIBRARY_PAGE`), com "Mostrar mais", por `GET /projetos/<id>/acervo` (`projectLibrary`,
  `src/site/site.ts`), que usa o mesmo acervo do agente (`src/acervo.ts`); a página do canvas não
  carrega mais lista nenhuma ao abrir. A duração do vídeo e do áudio é lida no navegador, do
  cabeçalho do arquivo; a imagem entra com 3 s.
- **Enviar do computador** (no pé do painel Arquivos e no canvas vazio): o arquivo vai para o R2 (`projetos/<projeto>/<arquivo>`, tabela
  `project_files`), com os limites do site (imagem 10 MB, vídeo e áudio 50 MB), e o
  bloco usa o endereço de lá; não some ao recarregar.
- **Ajustes do Final**: um card com Variações e Duração, depois Qualidade e formato,
  a última exportação e, presos embaixo, Baixar a variação escolhida e Baixar todas (os
  mesmos nomes do menu). **Qualidade e formato**: os mesmos campos dos modelos:
  Resolução (480p, 720p, 1080p, em botões conectados) e Formato (9:16, 16:9, 1:1,
  4:3, 3:4, no campo de seleção do site, com a explicação e o tamanho em pixels
  embaixo). O lado menor é o da resolução (720p em 16:9 = 1280 × 720). O quadro da
  Prévia segue o formato do Final. Vai no plano do Exportar. O campo de seleção do
  site ficou em `window.mdSelect` para servir também a campos postos depois.
- Cada projeto é só de quem o criou: de outra pessoa, nada abre, salva, recebe
  arquivo ou apaga (testes em `test/canvas.test.ts`).
- Tabelas `projects` e `project_files` (migration 0010).
- **API**: um agente edita o mesmo projeto por comandos, e a tela acompanha sozinha
  ([api.md](api.md)). Cada salvamento diz de qual revisão partiu.
- **Velocidade e enquadramento** (`speed` e `frame` no bloco, `speed` no Final): a largura do
  bloco é o tempo na tela (`len`), e `tin`/`tout` seguem em segundos do arquivo. O trecho da
  prévia usa `playbackRate` e `placement` (matriz CSS); o fundo desfocado é um quadro pequeno
  num canvas borrado, sem um segundo vídeo tocando.
- **Exportar** (`src/exportar.ts`, `container/exportar.py`, tabela `exports`, migration
  0013): o Worker lê o projeto **salvo** e monta o plano com `exportWork` (`modelo.js`).
  Cada grupo vira um trecho (H.264 sem B-frames e FLAC), guardado em
  `trechos/<hash>.mkv` pelo conteúdo: grupo igual não é refeito, nem entre exportações. A versão também: mesma lista de
  trechos, mesmo arquivo, em `exportacoes/versoes/<hash>.mp4`, reaproveitado por 24 horas;
  exportar sem mudar nada não chama o contêiner. Mudou o que os trechos geram: suba
  `SEGMENT_VERSION` (`src/exportar.ts`). O volume segue o molde dos editores de vídeo (09/11/2026,
  `SEGMENT_VERSION` 8): cada arquivo de som é medido inteiro (EBU R128) e levado a −14 LUFS, como o
  resto do site, sempre com o mesmo ganho; o volume do canvas vale sobre isso, sem nivelar o trecho;
  e a versão inteira recebe um ajuste só, na emenda, até −14 LUFS vezes o nível (o bloco mais alto,
  guardado em cada trecho: só um som em 30% fica em 30%). Antes, cada trecho era nivelado com a
  música dentro, e a música mudava de volume a cada cena. O som (09/11/2026, `SEGMENT_VERSION` 7): todo clipe tem rampa de
  10 ms em cada ponta, como a Edição rápida, menos onde ele continua outro sem salto no arquivo (a
  música cortada por cena), que `soundSeams` (`modelo.js`) marca com `segue`/`continua`; aí o
  trecho vai até o fim que tem de fato (quadros inteiros, o mesmo arredondamento de `exportar.py`) e
  o seguinte retoma dali, acelerado desde a mesma `origem` (o `atempo` não é exato). Por isso o mesmo
  grupo pode virar dois trechos, conforme o vizinho. O som é lido 0,5 s antes e depois do corte e
  cortado pela amostra: o MP3 lido do ponto exato saía mudo nos primeiros ~35 ms (o buraco de cada
  clipe) e o `atempo` perde o fim. Todo limitador compensa o atraso (`latency=1`).
  Cada versão é a emenda dos trechos: vídeo copiado, só o som vira AAC. A imagem cobre o
  quadro, como na prévia, a 30 quadros por segundo. Um passo por vez, dado no servidor
  por um Durable Object com alarme (`src/exportando.ts`, desde 09/11/2026): a tela e o
  `acompanhar_exportacao` só leem o andamento, e a exportação segue com a página fechada ou o agente
  desconectado (antes, o passo que passava dos 60 s do MCP ficava preso por 15 min). Bloco só
  entra com vídeo que a pessoa pode usar ou arquivo do próprio projeto. Os vídeos ficam
  24 horas para baixar; cada exportação vai até 48 versões (`MAX_VERSOES`), um a um ou em ZIP sem compressão, montado no Worker.
  Cada versão também sai **só o som**, em MP3 (10/11/2026): no diálogo, ao lado do vídeo (`movie`),
  o botão `graphic_eq` prepara o MP3 no servidor (o indicador no botão enquanto isso; o primeiro
  pedido liga o contêiner, `/som`, e o MP3 fica ao lado do vídeo no R2) e baixa. É a fala montada
  no canvas para o "Meu áudio" do HeyGen; o agente usa o `som` do `acompanhar_exportacao` direto
  no `gerar_video {audio}`.
- Código em `src/canvas/` (tela.html, canvas.js, modelo.js, player.js,
  miniaturas.js); `npm run canvas` gera `src/site/canvas.ts`, que o Worker usa. A
  página do canvas libera `data:` nas imagens e `blob:` no fetch (miniaturas e a
  onda do som); as outras páginas não. As frases de erro vêm de `src/erros.ts` pelo config.
- O protótipo (`prototipos/canvas/`) usa a mesma tela, com o exemplo de 6 versões.
