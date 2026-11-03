# Avaliações do agente

O que cada teste real de um agente fazendo um vídeo pelo MCP mostrou, nas palavras dele, com a
data. Serve para escolher o que entra no backlog ([backlog.md](backlog.md)); o que vira item lá
fica marcado aqui. O mais novo primeiro.

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
- Montar as variações: um `ligar` para um bloco no meio de um grupo liga ao grupo inteiro, e um
  `remover` desligou o Final. A estrutura foi refeita duas vezes.
- Erro do próprio agente: a primeira leva de animações não considerou a apresentadora na tela, e
  foi refeita inteira.
- Toda mudança de tempo pede realinhamento: cortar pausa ou trocar vídeo obriga a recalcular os
  `em` à mão, apagar e recriar cada camada e ajustar a velocidade.
- O agente não consegue ver o vídeo montado (o canvas pede login) e não exporta sem a pessoa ver
  antes: toda conferência da composição dependeu da pessoa.

### 3. O que mais custou tokens

- As respostas do `editar_projeto` e do `ver_projeto`: cada uma devolve o projeto inteiro, com uns
  30 arquivos antigos e todos os blocos do canvas. De longe o maior gasto.
  (O `editar_projeto` agora devolve só o resumo, sem arquivos e canvas; o `ver_projeto` também, com
  o início e o fim de cada bloco no grupo, e os arquivos e o canvas só pedidos em `incluir`.)
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
- `renderizar_html`: fila para chamadas em paralelo e um modo de prévia que devolva quadros sem
  salvar o arquivo.
- `listar_videos`: filtro por data e paginação.
- Arquivos: um comando para remover os que não são usados (o projeto tem mais de 30).

### 5. Ferramentas que faltam

- Ver a composição pronta: `ver_quadros` do Final montado, sem exportar. Eliminaria quase todo o vaivém.
- Encaixe automático: pôr o vídeo no rascunho com a fala casando, cortando o silêncio e ajustando
  a camada de cima.
- Camada que se adapta: a animação esticar ou encolher sozinha quando o bloco muda de duração.
- Ler o código de uma animação: devolver o HTML de um arquivo já renderizado, para editar em vez
  de reescrever.
- Áudio: enviar música por URL ou da biblioteca do site (o base64 sem terminal é inviável) e ter
  uma biblioteca de trilhas.
- Remover pausas por limite: cortar toda pausa acima de X segundos em todos os blocos, com realinhamento.

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
