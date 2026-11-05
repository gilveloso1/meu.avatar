# API dos projetos

Para um agente editar um projeto do canvas com o mesmo modelo da tela, sem navegador. Só o
administrador, como o canvas; cada projeto é só de quem o criou. O código está em
`src/api.ts` e `src/comandos.ts`. O servidor MCP e a transcrição vêm depois, por cima disto.

## Decisões

- **Comandos, não JSON do canvas.** O agente diz o que quer, e as regras são as da tela
  (`src/canvas/modelo.js`). Um lote vale inteiro ou não vale nada.
- **Velocidade e enquadramento são do bloco ou do Final**, e cada um existe em três
  lugares que precisam bater: `placement` e `len` no modelo (e a prévia, `player.js`) e
  `enquadrar` e `tempo` no `container/exportar.py`. Mudou um, mude o outro.
- **Token, não sessão.** `Authorization: Bearer ma_...`. O banco guarda só o hash
  (`api_tokens`). O token abre `/api/v1/` e as rotas de arquivos e de exportação de um
  projeto; não abre páginas, não apaga projeto, não salva JSON cru e não gera vídeo.
- **Sem tela de tokens por enquanto**: só há o administrador. Ela entra quando a API
  abrir para outras contas.
- **Revisão.** `projects.revision` sobe a cada mudança. Quem salva diz de qual revisão
  partiu; revisão velha dá 409 e nada é escrito.
- **A tela acompanha.** O canvas pergunta a cada 5 s (`/projetos/<id>/estado`) se houve
  mudança e adota o que veio, parado e sem nada por salvar. Se salvar por cima de uma
  mudança de fora, o que vale é o do servidor, com um aviso, e o desfazer zera.

## MCP

`POST /mcp` (`src/mcp.ts`) deixa um agente usar a API como ferramentas. Cada ferramenta é um
pedido às rotas abaixo, com o mesmo token: não há regra nem permissão própria.

- **Revisão 2026-07-28**, a atual: sem sessão e sem handshake, com `server/discover`, a versão
  e as capacidades em `_meta` e os cabeçalhos `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name`.
  A lista de ferramentas e o `server/discover` valem 5 min (`ttlMs`): depois de publicar, o
  agente vê as ferramentas novas em poucos minutos. O Claude Code usa esta revisão.
- **Clientes antigos** (`initialize`, até 2025-11-25) seguem funcionando no mesmo endereço. Por
  padrão, até o SDK v2 ainda conecta assim.
- Só token, por enquanto: o conector do claude.ai pede OAuth, que fica para depois.
- Ferramentas: `listar_videos`, `listar_avatares`, `listar_projetos`, `criar_projeto`, `ver_projeto`,
  `editar_projeto`, `ver_quadros` (devolve imagem), `inspecionar_animacao` (texto; imagem só com
  `quadros: true`), `ver_transcricao`, `ver_silencios`, `enviar_arquivo`,
  `renderizar_html`, `legendar`, `limpar_arquivos`,
  `exportar` e `acompanhar_exportacao`. Não apagam projeto e não geram vídeo.

```bash
claude mcp add --transport http meu-avatar https://meuavatar.ia.br/mcp --header "Authorization: Bearer ma_..."
```

## Criar um token

```bash
npm run token -- --email pessoa@exemplo.com --nome "Claude"
```

Sem `--remoto`, grava no banco local; com ele, em produção. O código aparece uma vez só.
Para revogar: `DELETE FROM api_tokens WHERE name = '...'`.

## Rotas

| Rota | O que faz |
|---|---|
| `GET /api/v1/videos?q=&desde=&ate=&limite=&continuar=` | Vídeos prontos que a conta pode usar, do mais novo ao mais antigo, 20 por vez (`limite` até 100). `desde` e `ate` são datas (`2026-11-02`, UTC; o dia do `ate` vale inteiro). Com mais vídeos, a resposta traz `continuar`, que vai no pedido seguinte |
| `GET /api/v1/animacoes?projeto=&avatar=&q=&limite=` | As animações em código já feitas nos projetos da conta, do projeto editado por último ao mais antigo (20 por vez, até 100): `{animacoes: [{projeto: {id, nome}, bloco, nome, duracao, texto, parametros, avatares, atualizado}], mais}`. `projeto` filtra um projeto; `avatar`, os projetos que usam vídeos ou ativos dele; `q` busca no nome, no texto na tela e nos valores dos parâmetros. Sem o código: leia com `ver_projeto` (`incluir: codigo`). Ver "Reusar animações", abaixo |
| `GET /api/v1/avatares?q=` | Avatares da conta com os ativos: `id`, `nome`, `tipo` (`imagem`, `video`, `audio`), `origem` (`gerado`, `enviado`), `foto`, `voz` e `src` |
| `GET /api/v1/projetos?q=` | Projetos da conta |
| `POST /api/v1/projetos` `{nome}` | Cria um projeto |
| `GET /api/v1/projetos/<id>?incluir=arquivos,codigo,canvas` | Revisão, grupos com os blocos (`id`, `nome`, `tipo`: video, imagem, audio, rascunho ou animacao; `camada`: base, cobertura ou audio, e `inicio` e `fim` em segundos do grupo), `ligacoes` (`id`, `de`, `para`: grupo ou Final), Finais com as variações e avisos. Os arquivos, o código das animações (`codigo: [{bloco, nome, duracao, html}]`) e o canvas inteiro só vêm pedidos em `incluir` (no projeto da Lara Resende, uns 17 dos 19 mil caracteres) |
| `POST /api/v1/projetos/<id>/comandos` `{revisao, comandos}` | Aplica um lote (até 100) e devolve só o que mudou: `{revisao, criados, mudou, avisosPendentes}` (abaixo). O projeto inteiro fica no `ver_projeto` |
| `GET /api/v1/projetos/<id>/quadros?src=&instantes=1,3.5` | JPG com os instantes lado a lado (até 12), para ver o vídeo |
| `GET /api/v1/projetos/<id>/animacao?bloco=&instantes=0,1.5&quadros=1&final=` | Abre o código de um bloco de animação no Chrome do render, sem fazer vídeo, no tamanho do Final (sem `final`, o primeiro), e mede cada instante (até 12, em segundos do bloco; sem `instantes`, o começo, os quartos e o fim). Volta `{largura, altura, duracao: {bloco, animacao}, problemas, instantes, linhaDoTempo}`, e `quadros` (o mosaico, JPG em base64) só com `quadros=1`. Ver "Inspeção da animação", abaixo |
| `GET /api/v1/projetos/<id>/silencios?src=` | Duração e silêncios do arquivo, com a regra da Edição rápida: `{duracao, silencios, som}`; arquivo sem faixa de áudio (como o WebM do render) vem com `som: false` e nenhum silêncio |
| `POST /api/v1/projetos/<id>/html` `{nome, html, duracao, final?}` | Faz um WebM transparente do HTML e o guarda nos arquivos do projeto: `{arquivo: {id, nome, tipo, src}, largura, altura}` |
| `POST /api/v1/projetos/<id>/legenda` `{grupo, revisao, bloco?, simular?, palavras?, semTexto?, fontes?, estilo?, final?, nome?}` | Legenda palavra a palavra do grupo, como animação em código por cima dele (com `bloco`, troca o código e o tempo de uma legenda que já existe). Responde como os comandos, com `legenda: {palavras, trechos}`; com `simular`, só `{duracao, palavras, trechos}`, sem mexer no projeto |
| `POST /api/v1/projetos/<id>/limpar` `{apagar?}` | Os arquivos do projeto que nenhum bloco usa: `{arquivos: [{id, nome, tipo, tamanho}], tamanho}`. Com `apagar: true`, apaga de vez (do banco e do R2); durante uma exportação, `409 exportando` |
| `GET /api/v1/projetos/<id>/transcricao?src=` | A fala com o tempo de cada palavra: `{idioma, duracao, texto, palavras: [{palavra, inicio, fim}]}` |

Nas três, `src` aceita também o `src` de um ativo de avatar da conta e o `href` de uma exportação
pronta deste projeto: é como o agente confere o que exportou.

| Rota | O que faz |
|---|---|
| `POST /projetos/<id>/arquivos` | Envia um arquivo (a mesma rota do canvas): `{src}` e, em vídeo, `som` (`false` quando o arquivo não tem faixa de som) |
| `POST /projetos/<id>/exportar` `{final, versoes?}` | Começa a exportação |
| `POST /projetos/<id>/exportacoes/<e>` | Faz o próximo passo; sem isso, o agendamento termina |
| `GET /projetos/<id>/exportacoes/<e>` | Estado e endereços para baixar |

A transcrição é do Whisper do Workers AI (`whisper-large-v3-turbo`, `src/transcricao.ts`): o
contêiner de exportação tira o som em MP3 mono de 16 kHz (`/audio`), e o Worker manda ao Whisper.
Custa US$ 0,0005 por minuto de áudio (os primeiros ~214 min por dia são grátis) e fica guardada
no R2 (`transcricoes/`) pelo etag do arquivo: pedir de novo não paga de novo. No primeiro teste no
ar (02/11/2026, vídeo de 7,9 s: 10 s na primeira vez, 1,5 s da cópia guardada), o fim da palavra
antes de uma pausa caiu a até 0,04 s do silêncio, mas a palavra depois da pausa começou até 0,34 s
antes da hora (o Whisper põe o silêncio dentro dela). Para cortar, use o fim das palavras e, no
começo, o fim do silêncio de `silencios`. Sem o Whisper ou o
contêiner, `503 transcricao_indisponivel`; som acima de 10 MB (uns 40 min), `413 audio_longo_demais`.

O vídeo do HTML sai do contêiner de render (`src/render.ts`, `container/render/`), com o
HyperFrames. O agente manda só o conteúdo (elementos, `<style>` e `<script>`); a página, o
tamanho do Final (`final`, ou o primeiro; 720 × 1280 sem nenhum) e o fundo transparente já
existem. A animação é só pela linha do tempo `tl` do GSAP 3, já criada e pausada (`tl.to`,
`tl.fromTo`, `tl.set`, com o tempo em segundos): nada de `setTimeout`, relógio ou sorteio, para
o vídeo sair igual toda vez. Sem internet: nada de CDN, link ou imagem de fora. Fontes pelo nome
no CSS: TikTok Sans, Inter (a padrão), Montserrat, Roboto, Open Sans, Oswald, Playfair Display,
Poppins, Anton, Bebas Neue, Archivo Black, Courier Prime e Pacifico. Emojis saem coloridos em
qualquer uma (Noto Color Emoji, instalada no sistema da imagem). Até 60 s e 1 MB de HTML.
Uns 16 s para 10 s de vídeo; a primeira vez depois de publicar demora mais. HTML que não roda:
`422 render_falhou`, com o log do HyperFrames em `detalhe`. Sem o contêiner,
`503 render_indisponivel`. O WebM entra com `adicionar {arquivo, dur, sobre, em}`.

A legenda (`src/legenda.ts`) junta a transcrição e a animação em código: o projeto guarda o HTML
dela, a prévia do canvas mostra e a exportação renderiza. As palavras dos blocos que falam
(os de vídeo da sequência com som, ou os de `fontes`) vão para o tempo do grupo, com o corte e a
velocidade de cada bloco, e viram trechos: quebra na pontuação, numa pausa de 0,25 s, com 4
palavras ou 24 letras, e palavra curta sozinha entra na anterior. Cada trecho sai 0,35 s depois
da última palavra, quando o próximo entra ou quando começa um intervalo de `semTexto` (onde já há
texto na tela, em segundos do grupo; as palavras dali não aparecem). O padrão é o do caso
aprovado: Inter Black de 44 px numa coluna de 420 px (numa tela de 720; cresce com o Final), em
maiúsculas, a palavra dita em verde (`#46ff96`), no máximo duas linhas, a 80% da altura.
`estilo` muda `fonte`, `tamanho`, `cor`, `destaque`, `maiusculas` e `altura` (0 topo, 1 base).
Para corrigir a grafia (a da tela é o português correto, não o texto mandado ao avatar), chame
com `simular`, conserte as `palavras` e mande de volta. A legenda vale para o grupo como está:
faça depois dos cortes e, se o grupo mudar, chame de novo com `bloco` (o id da legenda): o código e
o tempo dela são trocados, sem pôr outra. Até 60 s por grupo. Pede `revisao`, como os comandos. O
tamanho da letra segue o Final da hora (`final`, ou o primeiro): mudou o formato, legende de novo.

`avisos`, no `ver_projeto`, aponta o que está aceito mas sairá errado.
Há três. `rascunho` (`bloco`, `fala`, `segundos`): uma fala que ainda espera o vídeo. `final_sem_variacao` (`final`): nenhum grupo chega a esse Final, que não exporta nada (falta ligar a última cena). E `sem_video_de_base` (`grupo`, `de`, `ate`, `segundos`, a partir do começo do grupo),
quando uma cobertura ou um som passa do fim da sequência ou há um buraco nela. Aquele trecho sai
sobre o fundo preto, salvo se uma cobertura opaca o preencher.

Erro: `{"erro": "<código>"}`, com `comando` (a posição no lote, a partir de 0) quando um comando é
recusado. Em `comando_desconhecido`, `sugestao` traz o tipo com o nome mais parecido
(`troca` → `trocar`) ou, se nenhum chega perto, `tipos` traz a lista. Quando o contêiner não responde (subindo, indo dormir ou ocupado), o site tenta de novo
sozinho duas vezes; se ainda falhar, `503 conteiner_falhou` em quadros, silêncios, transcrição,
HTML e legenda: tente de novo em instantes. Chamadas em paralelo esperam a vez no contêiner. Em
`quadros`, instante depois do fim mostra o último quadro. Em 409 (`conflito`: outra pessoa, como o canvas, salvou antes), a resposta traz o projeto como
está agora, igual ao resumo do `ver_projeto`, com a `revisao` nova: compare com o que você tinha e
refaça o lote, sem ler o projeto de novo. O que cada um mudou, peça a peça, pede o histórico de
versões (item 8 do backlog).

## Inspeção da animação

O agente via o resultado de uma animação por imagem, e os defeitos de um exemplo de 8 s (título
que quebrou em duas linhas, "%" passando da borda do card, texto cortado embaixo) estavam todos
na geometria do DOM. O `inspecionar_animacao` (`container/render/inspecionar.mjs`) abre a mesma
página do render (`pagina()`), leva `tl.seek(t)` a cada instante e responde em texto curto, em
menos de 1 s; o mosaico vem só com `quadros: true`.

- `instantes`: no primeiro, os `elementos` visíveis; nos outros, só o que `mudou` e o que `saiu`.
  Cada elemento é uma linha: `seletor x,y LxA op0.5 2linhas "texto"`, em px do Final (`op` só
  abaixo de 1, `linhas` só acima de 1). Visível é o que tem opacidade, tamanho e um pedaço na tela
  e no pai que corta; entram os que têm texto próprio, id, fundo, borda ou imagem. O seletor é o
  id, ou `tag.classe` com `[n]` quando se repete.
- `problemas` `[{tipo, alvo, t, detalhe}]`, um por elemento com os instantes em que aparece:
  `quebrou` (mais linhas do que `data-linhas`, `-webkit-line-clamp` ou `nowrap` permitem),
  `palavra_partida` (mais linhas que palavras), `fora_da_tela` e `cortado_pelo_pai` (quanto passa
  de cada lado; o pai é o mais próximo com `overflow` que corta), `texto_cortado` (o próprio
  elemento corta: `scrollHeight > clientHeight`), `texto_sobre_texto` (linhas de dois textos
  visíveis que se cobrem), `fonte` (a família pedida não existe aqui ou não carregou),
  `erro_de_script`, `passa_do_bloco` (a linha do tempo termina depois do bloco) e
  `parametro_sem_valor` (o código usa `{{chave}}` ou `params.chave` e o bloco não tem esse valor em
  `parametros`: o texto sai como está, e o script recebe `undefined`; vem do site, sem instantes).
- `linhaDoTempo`: um tween por linha, `início-fim alvo propriedades` (de `tl.getChildren`).
- `duracao`: a do bloco e a da animação (o fim do último tween).

No exemplo de 8 s com os três defeitos, a resposta tem uns 1.500 caracteres; o mosaico de quatro
instantes, uns 14 mil em base64.

## Comandos

| `tipo` | Campos | Efeito |
|---|---|---|
| `adicionar` | `video`, `arquivo` ou `ativo` (de `listar_avatares`); `nome`, `inicio`, `fim`, `semSom`; `dur` (obrigatório em vídeo e áudio de `arquivo` e de ativo enviado; o ativo gerado usa a duração do vídeo); `depois` ou `sobre` e `em` | Bloco novo. `depois`: entra logo depois daquele bloco e empurra o resto. `sobre`: cobre o grupo a `em` segundos do começo do bloco citado (ou soma o som, se for áudio); o `em` pode passar do bloco até o fim do grupo, e do primeiro bloco é o tempo do grupo. A camada fica presa ao ponto da fala em que começa (ver "Camadas que acompanham"). Sem os dois: bloco solto, à direita de tudo. Vídeo de `arquivo` sem faixa de som (o WebM do render, uma animação) entra sem a camada de áudio, como com `semSom` |
| `adicionar` (cópia) | `animacao: {projeto, bloco}` (de `listar_animacoes`); `parametros`, `duracao`, `nome`; `depois` ou `sobre` e `em`; `rotulo` | Copia uma animação já feita num projeto da conta (este ou outro): o código, os parâmetros, a duração e o nome. O que vier aqui muda, e os `parametros` se juntam aos dela. A cópia é independente: mudar uma não mexe na outra. Projeto ou bloco que não existe, de outra pessoa ou sem código: `animacao_inexistente`. Com `html` junto: `codigo_invalido` |
| `adicionar` (animação) | `html`, `duracao` (0,5 a 60); `nome`; `depois` ou `sobre` e `em`; `rotulo` | Animação em código: o projeto guarda o HTML (até 100 mil caracteres, com as regras do `renderizar_html`), não um WebM. Sem `nome`, Animação 1, Animação 2... A prévia do canvas roda o código; a exportação faz o vídeo dela no tamanho do Final, uma vez só por código, tamanho e duração. `cortar` muda o tempo até 60 s; `enquadrar` não vale (o código já desenha no tamanho do Final) |
| `editarCodigo` | `bloco`; `html` ou `trocas: [{de, para}]` (até 50); `parametros` | Troca o código da animação inteiro ou só trechos, sem reenviar a cena. Cada `de` tem de aparecer uma vez só, como está; senão, `trecho_nao_unico` com `troca` e `vezes`. Só `parametros` muda só os valores |

**Reusar animações.** Não há modelos prontos: as possibilidades de estilo e layout não cabem
numa lista. Cada animação que um agente faz fica no projeto, e o próximo agente parte dela. A
instrução do MCP diz como (combinado com o dono em 04/11/2026):

1. Antes de criar, procurar com `listar_animacoes` no mesmo projeto e nos projetos do mesmo avatar.
2. Achou uma que se encaixa bem: partir dela sem perguntar. Copiar com
   `adicionar {animacao: {projeto, bloco}}`, trocar os `parametros` e ajustar com `editarCodigo`.
3. O pedido é muito diferente e nada do projeto ou do avatar se encaixa: perguntar à pessoa antes,
   entre criar uma nova e partir de uma de outro projeto. Uma de outro avatar também pede a pergunta,
   mesmo que sirva bem: pode ser outra marca, sem relação com o projeto.
4. Na pergunta, o agente leva a análise de custo e benefício e uma recomendação. Reaproveitar o
   código com mudanças profundas (a estrutura, a linha do tempo) também vale; decidir o que sai
   melhor e mais barato é dele.

Assim os trabalhos se acumulam e ficam à mão para o próximo vídeo.

**Parâmetros** (`parametros: {chave: texto ou número}`, até 30, em `adicionar` com `html` e em
`editarCodigo`): os valores que um template muda sem reescrever o código, como nome, preço ou cor da
marca. No HTML, `{{chave}}` fora dos scripts vira o valor, escapado; nos scripts, `params.chave`.
Em `editarCodigo`, os valores novos se juntam aos que já existem, e `null` tira uma chave. Chave é
letra, número e `_`, começando por letra (`parametros_invalidos`, com `parametro`). A prévia, a
inspeção e a exportação usam o código já com os valores (`codeHtml`, `src/canvas/modelo.js`):
outro valor faz outro vídeo na exportação, e o mesmo valor reaproveita. No canvas, cada parâmetro
é um campo nos Ajustes do bloco. Animação sem parâmetros roda como foi guardada.
| `rascunho` | `fala`, `duracao` (0,5 a 30); `nome`; `depois` ou `sobre` e `em`; `rotulo` | O lugar de um vídeo que ainda não existe: um bloco sem arquivo, com a fala, do tamanho estimado. Sem `nome`, Texto 1, Texto 2..., como os blocos. No canvas e na prévia, um cartão com a fala. A exportação é recusada enquanto houver rascunho |
| `trocar` | `bloco`; `video`, `arquivo` ou `ativo`; `inicio`, `fim`, `dur`, `nome`, `semSom`, `aparar` | Põe o arquivo no lugar do bloco (o vídeo pronto no lugar do rascunho): a posição e o que está por cima ficam, e a sequência acompanha a duração nova. Vídeo sem `inicio` nem `fim` entra sem o silêncio das pontas (fica 0,1 s antes da fala e 0,2 s depois, pelos silêncios de `ver_silencios`); `aparar: false` o põe inteiro, e sem análise ele também entra inteiro. No lugar de um rascunho, a camada por cima vai para o mesmo ponto na proporção do bloco já aparado (a fala real tem outro tamanho que a estimada); sem `nome`, o bloco fica com o nome do arquivo; no lugar de um arquivo, fica no mesmo segundo do bloco |
| `renomear` | `bloco` ou `grupo`, `nome` | Muda o nome do bloco, como o campo Nome dos Ajustes; com `grupo` (o id de qualquer bloco dele), o nome do grupo, como "Cena 1" no lugar de "Bloco 1" |
| `cortar` | `bloco`, `inicio`, `fim` ou `duracao` | Trecho do arquivo, em segundos; a sequência fica encostada. `duracao` no lugar de `fim` é o que fica a partir do início: num rascunho, `{bloco, duracao: 3}` deixa 3 s |
| `dividir` | `bloco`, `em` | Dois blocos, no instante `em` do arquivo; 0,5 s no mínimo de cada lado |
| `mover` | `bloco`, `depois` ou `antes` | Muda a ordem, sem buraco, também para outro grupo (assim se juntam dois); a cobertura e o som somado vão junto |
| `velocidade` | `bloco`, `velocidade` (0,25 a 4) | Mantém o tom da voz; o resto da sequência acompanha |
| `removerTrechos` | `bloco`, `trechos: [[inicio, fim], ...]` (até 200) | Tira esses trechos do arquivo (vícios, repetições, frases, pelos tempos da transcrição) e o resto encosta. Sobra menor que 0,5 s é recusada (`sobra_curta`): junte-a ao trecho do lado |
| `removerPausas` | `bloco` (sem ele, todos), `pausa` (`curta`, `media`, `longa`) ou `acima` (0,1 a 5 s) | Com `pausa`, tira as pausas com a regra da Edição rápida. Com `acima`, toda pausa maior que isso fica com isso (60% depois da fala, o resto antes da seguinte; no começo do bloco, só a parte de antes), a mesma regra em todos os blocos; corte menor que 0,08 s não é feito, nem o que deixaria um pedaço menor que 0,5 s. O bloco vira vários, com o mesmo nome (os novos em `criados`). Fora do limite: `pausa_invalida` com `minimo` e `maximo`; os dois juntos: `pausa_invalida` com `motivo` |
| `enquadrar` | `bloco`; `zoom` (1 a 8), `focoX`, `focoY` (0 a 1) ou `rosto: true`; `chaves: [{t, zoom, focoX, focoY}]`; `encaixe` (`preencher`, `caber`, `desfocar`); `recorte: {esquerda, topo, direita, base}`; `espelharH`, `espelharV`, `girar` (0, 90, 180, 270); `limpar` | Só muda o que vier. `t` é o tempo do bloco (negativo continua um movimento do bloco anterior); entre as chaves, a curva é suave |
| `ligar` | `de`, `para` | Liga o grupo de um bloco a outro grupo ou a um Final (o grupo tem o id do primeiro bloco). Encadeia, não junta: para juntar dois grupos, `mover`. Ligar a outro grupo um grupo que é a única entrada de um Final (a ligação automática do primeiro bloco) tira essa ligação. Fora isso, soma: cada saída de um grupo vira uma variação; para a sequência das cenas, `ordenar`. Recusa círculo, repetida e passar de 48 variações |
| `ordenar` | `grupos` (um bloco de cada grupo, na ordem), `final` | Liga as cenas nessa ordem e a última ao Final (sem `final`, o único que houver), no lugar das ligações entre elas e das delas ao Final, inclusive a automática do primeiro bloco. Ligações de fora (ganchos que chegam à primeira) ficam. Recusa grupo repetido ou que não existe (`grupos_invalidos`) e Final que não existe (`final_inexistente`) |
| `remover` | `ids`, `fechar` | Blocos, Finais ou ligações (os ids de `ligacoes`). Com `fechar: true`, a sequência encosta onde o bloco saiu; sem ele, tirar um bloco do meio parte o grupo em dois (aviso `grupo_partido`). Tirar o primeiro bloco de um grupo passa o id do grupo e as ligações ao bloco seguinte (`gruposComIdNovo` na resposta); o nome do grupo e as ligações, com o mesmo id, vão junto |
| `som` | `bloco`, `volume` (0 a 4), `mudo` | Volume do bloco |
| `final` | `id`, `resolucao`, `formato`, `velocidade` | Muda um Final; sem `id`, cria outro. A velocidade vale para todas as variações dele |
| `organizar` | | O mesmo Organizar da tela |

Em `adicionar`, `rascunho` e `dividir`, `rotulo: "nome"` permite citar o bloco como `"@nome"` nos comandos
seguintes do mesmo lote, sem esperar a resposta (em `bloco`, `depois`, `antes`, `sobre`, `de`, `para`, `grupo`, `grupos` e `ids`).

O primeiro bloco de um projeto vazio traz o Final `final`, já ligado a ele, como na tela.

**Camadas que acompanham** (05/11/2026, o retrabalho do teste da Lara Resende): a cobertura e o som
somado ficam presos ao ponto da fala em que começam, no bloco de baixo. Quando algo antes dele muda, a
camada anda junto (como já era). Quando o próprio bloco muda, ela vai para o mesmo instante do arquivo:
`cortar` o começo, `velocidade`, `removerPausas` e `removerTrechos` (se o ponto saiu no corte, ela vai
para onde a fala volta; se saiu no fim, para o fim do bloco). No `trocar`, o arquivo é outro: no lugar de
um rascunho, a camada vai para o mesmo ponto na proporção; no lugar de um arquivo, fica no mesmo segundo
do bloco. A duração da camada não muda: uma animação não estica quando a fala encurta. Só os comandos
fazem isso; mexer na tela do canvas segue como era.

Roteiro com cenas: um grupo por cena (com nome: `renomear {grupo, nome: "Cena 1"}`), de preferência até uns 30 s;
um `rascunho` ou `adicionar` sem `depois` nem `sobre` abre uma cena nova. As cenas vão em ordem até o
Final com `ordenar {grupos: ["@c1", "@c2", ...]}`; não é preciso juntar no fim, o Final monta a
sequência. O lote cria as cenas, dá nome e ordena de uma vez, com `rotulo`; para mudar a ordem
depois, `ordenar` de novo. (Com `ligar` também dá: ligar a primeira cena à seguinte tira a ligação
automática do primeiro bloco ao Final.) Para tirar uma
fala do meio, `remover` com `fechar: true`. Cada edição só mexe no tempo da cena dela (a resposta fica pequena), a legenda
cabe nos 60 s por grupo e dá para trocar ou testar uma cena sem tocar nas outras. Uma cena mais
longa pode passar dos 30 s: não corte uma fala ou uma cobertura no meio, porque a cobertura não
passa de um grupo para o outro.
A resposta traz `criados`, com os ids novos na ordem dos comandos, e em `mudou` só o que o lote
mexeu, para não devolver o projeto inteiro a cada edição (num roteiro de 30 falas, o resumo inteiro
passava de 7 mil caracteres): `grupos` novos ou alterados, cada um com só os blocos novos ou
alterados (sem `blocos`, o grupo só mudou de nome ou de duração; os que só andaram, porque um corte antes deles mudou o tempo, vêm em `andaram`: uma
faixa `{de, ate, segundos}` por deslocamento, na ordem do grupo); `gruposComIdNovo` (`[{de, para}]`, o grupo que só trocou de id porque o primeiro bloco saiu; não
vem em `removidos`); `ligacoes` e `finais` novos ou alterados; `removidos` (`blocos`, `grupos`, `finais`,
`ligacoes`); `avisos` que apareceram ou mudaram de valor (o rascunho com outra duração vem uma vez, com a nova; mais `grupo_partido`, `{grupo, partes}`, quando o lote partiu
um grupo) e `avisosResolvidos`. Campo vazio não vem. Nos avisos de `rascunho` a `fala` não vem (quem editou
acabou de escrevê-la; o `ver_projeto` mostra). `avisosPendentes` conta os avisos que o projeto tem
agora.

## Limites de agora

- A transcrição não acha sozinha os vícios e as repetições: quem decide é o agente, pelo texto.
- Os ativos de avatar entram pela API, mas o "Seus vídeos" do canvas ainda não os lista.
- Sem limite de uso por conta: exportar custa contêiner, e isso precisa de regra antes
  de abrir a outras contas.
- Velocidade e enquadramento ainda não têm campos nos Ajustes: só pela API, e a prévia mostra.
- O fundo desfocado da prévia não acompanha o zoom; o da exportação, sim.
- Vídeo WebM com transparência funciona como cobertura (`exportar.py` detecta o alfa), para
  legendas e gráficos feitos fora. Na prévia, depende do navegador.
