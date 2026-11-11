# Avaliações do agente

O que cada teste real de um agente fazendo um vídeo pelo MCP mostrou, nas palavras dele, com a
data. Serve para escolher o que entra no backlog ([backlog.md](backlog.md)); o que vira item lá
fica marcado aqui. O mais novo primeiro.

## MCP com menos contexto, pastas, link de envio e apagar projeto (11/11/2026)

Dois agentes novos, um depois do outro, só com o MCP do site local (sem ler o código, sem contêiner
e sem gerar nada), cada um com um pedido de anúncio completo. Os projetos ficaram no banco local,
que não é guardado.

### Primeiro teste (antes dos ajustes)

Pedido: projeto novo numa pasta, 3 ganchos, corpo e CTA em rascunho (3 variações), imagem e áudio
do computador pelo link de envio, título animado, corte, velocidade, nota, vídeos numa pasta e um
projeto criado e apagado.

- 28 chamadas, um lote de 20 comandos aceito de primeira, nenhum erro de uso. Pastas, link de envio
  e apagar projeto sem tropeço; a resposta do primeiro passo do apagar foi clara.
- Leu a ajuda de quatro assuntos (15,4 mil caracteres), porque as instruções mandavam ler na
  primeira vez de cada um. Com isso a conversa leu mais do que antes da mudança (uns 42 mil
  caracteres contra 39 mil). A ajuda `comandos` repetia as assinaturas da descrição.
  (Corrigido: a ajuda `comandos` traz só as regras, e as instruções mandam ler sempre só `animacoes`
  e `comandos`; as outras, quando a descrição não bastar.)
- Dava para apagar direto com `confirmar: true`, sem o primeiro passo.
  (Corrigido: o primeiro passo devolve um código, e só ele apaga; projeto que mudou pede outro.)
- Para conferir volume e velocidade teve de pedir o canvas inteiro (6 mil caracteres, nomes internos).
  (Corrigido: o resumo traz `velocidade`, `volume` e `mudo` quando saem do padrão.)
- `conteiner_falhou` não diz o que fazer. (Em aberto.)

### Segundo teste (depois dos ajustes)

Pedido: segunda versão do anúncio, com dois vídeos na mesma cena, a animação do outro projeto
reaproveitada com outro texto, corte e mudo, música pelo link de envio, a ordem das cenas trocada
(corpo antes de dois ganchos) e um projeto a apagar que não existia.

- 19 chamadas, nenhum erro. Leu só `comandos` e, depois, `cenas`: uns 35 mil caracteres de
  instruções, ferramentas e ajuda na conversa inteira. Não chamou o apagar, porque o projeto não existia.
- Reusar a animação foi direto (`listar_animacoes` e `adicionar {animacao, parametros}`).
- Ramificar depois do corpo saiu de primeira, mas pedindo raciocínio: a ajuda do `ordenar` só dava o
  caso dos ganchos que chegam à primeira cena. (Corrigido: a ajuda dá também o caso inverso.)
- O corte do arquivo não aparecia no resumo, só no canvas (`tin`, `tout`).
  (Corrigido: o bloco cortado traz `corte: [início, fim]`.)
- O `listar_animacoes` mostrava `{{texto}}` no lugar do texto na tela.
  (Corrigido: os valores dos parâmetros entram no texto.)
- A cena sem nome aparece com o nome do bloco, e não há como saber pelo `ver_projeto` se ela já foi
  nomeada. (Em aberto.)
- A `duracao` do `listar_arquivos` é a pedida ao modelo, não a medida: nos vídeos de exemplo, 8 a
  25 s contra 6 s de verdade. Com vídeos reais a diferença deve ser pequena, mas o agente planeja
  cortes com esse número. (Em aberto.)

### O que foi para o backlog

`conteiner_falhou` com orientação, a cena sem nome e a `duracao` medida entraram em "Pendências
pequenas" do [backlog](backlog.md).

## Proposta do Lara Resende (02/11/2026)

Projeto feito do zero numa sessão separada, só com o MCP e as ferramentas gerais (pesquisa e
arquivos, sem terminal), pela pasta modelo em `Documentos/Meu Avatar` (o `CLAUDE.md` dela tem o
fluxo). Do briefing à estrutura: pesquisa, roteiro com 3 ganchos e 10 cenas (uns 48 s),
rascunhos no lugar das cenas da Marina e animações do corpo em `renderizar_html`. Faltavam os
vídeos da Marina, a troca dos rascunhos, a legenda e a trilha.

### 1. Erros do aplicativo e do MCP

- Mandar várias chamadas ao mesmo tempo (`renderizar_html`, `ver_quadros`) derrubou o servidor com
  erro 1101 e tempo esgotado. Uma por vez funcionou.
- O `renderizar_html` também falhou sozinho uma vez, com "Container port connection closed", e
  passou na segunda tentativa.
  (Causa, nos logs de 02/11/2026: o contêiner de render não atendeu ao ligar, "The container
  service is unreachable", e um `ver_quadros` pediu um instante no fim do arquivo; os dois viravam
  exceção. Corrigido: novas tentativas sozinhas e `conteiner_falhou` no lugar da queda.)
- O `editar_projeto` deu conflito duas vezes porque a pessoa editava o canvas ao mesmo tempo. A
  resposta só traz o número da revisão, e foi preciso reler o projeto inteiro.
  (Agora o conflito traz o resumo do projeto como está, com a revisão nova.)
- A descrição das ferramentas estava desatualizada: não citava o `rascunho` e o `trocar`. Um teste
  com `troca` recebeu `comando_desconhecido`, sem sugestão do nome certo.
  (Causa: a lista de ferramentas vai com cache de 1 h, `CACHE` em `src/mcp.ts`, e a sessão começou
  antes da publicação. O cache agora é de 5 min, e o `comando_desconhecido` traz `sugestao`.)
- Emojis (📅, ✓) viram quadradinhos no `renderizar_html`: a imagem de render não tem fonte de emoji.
  (Corrigido na imagem 2 do render, com a Noto Color Emoji no sistema.)

### 2. O que mais atrapalhou e gerou retrabalho

- O `sobre`/`em` conta o tempo a partir do começo do grupo, não do bloco citado. Por isso as oito
  animações do corpo ficaram empilhadas no segundo 0, e foi preciso a pessoa no canvas para descobrir.
  (Agora o `em` conta do bloco citado, 05/11/2026.)
- Montar as variações: um `ligar` para um bloco no meio de um grupo liga ao grupo inteiro, e um
  `remover` desligou o Final. A estrutura foi refeita duas vezes.
- Erro do próprio agente: a primeira leva de animações não considerou a apresentadora na tela, e
  foi refeita inteira.
- Toda mudança de tempo pede realinhamento: cortar pausa ou trocar vídeo obriga a recalcular os
  `em` à mão, apagar e recriar cada camada e ajustar a velocidade.
  (Agora a camada segue o ponto da fala nos cortes, na velocidade, nas pausas e no `trocar`, 05/11/2026.)
- O agente não consegue ver o vídeo montado (o canvas pede login) e não exporta sem a pessoa ver
  antes: toda conferência da composição dependeu da pessoa.

### 3. O que mais custou tokens

- As respostas do `editar_projeto` e do `ver_projeto`: cada uma devolve o projeto inteiro, com uns
  30 arquivos antigos e todos os blocos do canvas. De longe o maior gasto.
  (O `editar_projeto` agora devolve só o resumo, sem arquivos e canvas; o `ver_projeto` também, com
  o início e o fim de cada bloco no grupo, e os arquivos e o canvas só pedidos em `incluir`.)
  (Num roteiro de 30 falas, em 04/11/2026, o agente ainda reclamou: o resumo inteiro voltava a cada
  edição, uns 7,6 mil caracteres, metade nas falas dos rascunhos. Agora a resposta traz só o que o
  lote mudou, em `mudou`, sem as falas.)
  (No teste seguinte, um roteiro de 9 falas em 3 cenas, as respostas ficaram entre 219 e 997
  caracteres, mas o agente precisou de 5 chamadas em vez de 2: a ligação automática do primeiro
  bloco ao Final virou uma variação a mais e só se via no canvas inteiro, e tirar uma fala do meio
  partiu a cena sem aviso. Agora as ligações vêm com o id no resumo, há o aviso `grupo_partido`, e as
  instruções explicam `fechar`, `ligar` e `mover`.)
  (No segundo teste, 4 chamadas e o projeto certo, mas tirar a primeira fala de uma cena apagou as
  ligações dela, e a ligação automática não dava para tirar no mesmo lote. Agora as ligações passam
  ao bloco seguinte do grupo (também no canvas), a automática sai ao ligar a primeira cena à
  seguinte, e há o aviso `final_sem_variacao`.)
  (No terceiro, 3 chamadas e o projeto certo de primeira, inclusive trocando a ordem das cenas.
  Sobraram detalhes: o grupo que só trocou de id parecia removido, o aviso do rascunho vinha duas
  vezes quando só a duração mudava, não se sabia se `ligar` troca ou soma, e faltavam a duração
  direta e o nome do grupo. Agora há `gruposComIdNovo`, o aviso vem uma vez, `cortar {duracao}` e
  `renomear {grupo}`, e a descrição do `ligar` diz que ele soma.)
  (No quarto, o projeto ficou certo, com nomes e ordem trocada, mas o `@rotulo` não valia em
  `renomear {grupo}` e o nome da cena se perdia quando o primeiro bloco dela saía. Corrigido: o
  rótulo vale em `grupo`, e o nome segue o grupo como as ligações, também no canvas.)
  (No quinto, 3 lotes sem recusa e o projeto certo de primeira. Trocar a ordem das cenas pedia
  remover 3 ligações e criar 3; agora há `ordenar {grupos}`, que também monta a sequência na
  criação.)
- Reenviar o HTML completo a cada correção: 3 a 5 mil caracteres por cena, com o mesmo CSS do
  painel repetido em todas.
- O raciocínio de layout e de tempos: coordenadas do SVG, posições das moedas, a matemática do
  velocímetro e os `em` acumulados.
- `listar_videos` sem filtro, que devolveu o histórico inteiro da conta.
  (Agora vem 20 por vez, com filtro de data e `continuar`.)

### 4. Ferramentas que precisam de ajuste

- `editar_projeto`: modo resumido (só a revisão, os ids criados e os avisos); erro com o nome
  certo do comando; no conflito, devolver o que mudou.
- `ver_projeto`: filtros (só o Final, sem arquivos, sem canvas) e o tempo de início de cada bloco
  dentro do grupo.
- `adicionar` com `sobre`: opção de ancorar no bloco, não no grupo, e a camada acompanhar o bloco
  quando ele muda de tamanho.
  (Feito em 05/11/2026: o `em` conta do bloco citado e a camada segue o ponto da fala.)
- `renderizar_html`: fila para chamadas em paralelo e um modo de prévia que devolva quadros sem
  salvar o arquivo.
- `listar_videos`: filtro por data e paginação.
- Arquivos: um comando para remover os que não são usados (o projeto tem mais de 30).
  (Feito: `limpar_arquivos`, que mostra a lista e só apaga com `apagar: true`.)

### 5. Ferramentas que faltam

- Ver a composição pronta: `ver_quadros` do Final montado, sem exportar. Eliminaria quase todo o vaivém.
- Encaixe automático: pôr o vídeo no rascunho com a fala casando, cortando o silêncio e ajustando
  a camada de cima.
  (Feito: o `trocar` tira o silêncio das pontas e leva a camada na proporção.)
- Camada que se adapta: a animação esticar ou encolher sozinha quando o bloco muda de duração.
  (Feito em 05/11/2026: a animação em código guarda a escala e estica com a fala; `esticar: false` não deixa.)
- Ler o código de uma animação: devolver o HTML de um arquivo já renderizado, para editar em vez
  de reescrever.
- Áudio: enviar música por URL ou da biblioteca do site (o base64 sem terminal é inviável) e ter
  uma biblioteca de trilhas.
  (Por URL, feito em 07/11/2026: `enviar_arquivo {url}`, o servidor baixa; vale para imagem, vídeo e
  áudio. Arquivo que só está no computador: desde 11/11/2026, o `enviar_arquivo` sem `url` devolve
  um link de envio e o `curl`; sem terminal, o agente passa o comando à pessoa.)
- Remover pausas por limite: cortar toda pausa acima de X segundos em todos os blocos, com realinhamento.
  (Feito: `removerPausas {acima}`, com as camadas acompanhando. Num teste só pelo MCP, em 05/11/2026,
  um agente conferiu os quatro casos com os números esperados; achou um erro, corrigido no mesmo dia:
  sem `bloco`, a camada do segundo vídeo andava duas vezes o que o primeiro encolheu.)

### 6. O que seria bom ter pronto

- Templates de layout: tela dividida com a apresentadora em cima, cartão sobre o tronco e lower
  third, nas cores da marca, chamados por nome com parâmetros (sem reenviar o CSS a cada cena).
- Kit de marca por perfil: logo, cores e fontes guardados no site e aplicados sozinhos.
- Biblioteca de animações didáticas: velocímetro, contador, barra que encolhe, gráfico de candles,
  pizza com fatia, carimbo, calendário e chuva de moedas, parametrizáveis.
- Presets de legenda: o padrão do caso aprovado numa chamada.
- Metadados de enquadramento por avatar: onde fica o rosto de cada um, para posicionar camadas
  sem adivinhar.
- Modelo de projeto com variações de gancho: a estrutura pronta, com os ganchos ligados ao corpo.

### O que foi para o backlog

Os pontos acima viraram o item "O que o teste da Lara Resende pediu" do [backlog](backlog.md),
agrupados: erros, respostas menores, tempo que acompanha, ver o resultado e o que já vem pronto.
