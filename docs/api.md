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
  `editar_projeto`, `ver_quadros` (devolve imagem), `ver_transcricao`, `ver_silencios`, `enviar_arquivo`,
  `renderizar_html`, `legendar`,
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
| `GET /api/v1/avatares?q=` | Avatares da conta com os ativos: `id`, `nome`, `tipo` (`imagem`, `video`, `audio`), `origem` (`gerado`, `enviado`), `foto`, `voz` e `src` |
| `GET /api/v1/projetos?q=` | Projetos da conta |
| `POST /api/v1/projetos` `{nome}` | Cria um projeto |
| `GET /api/v1/projetos/<id>?incluir=arquivos,canvas` | Revisão, grupos com os blocos (`id`, `nome`, `tipo`, `camada`: base, cobertura ou audio, e `inicio` e `fim` em segundos do grupo), Finais com as variações e avisos. Os arquivos e o canvas inteiro só vêm pedidos em `incluir` (no projeto da Lara Resende, uns 17 dos 19 mil caracteres) |
| `POST /api/v1/projetos/<id>/comandos` `{revisao, comandos}` | Aplica um lote (até 100) e devolve o resumo: `{revisao, criados, grupos, finais, avisos}`, como o projeto sem `incluir` |
| `GET /api/v1/projetos/<id>/quadros?src=&instantes=1,3.5` | JPG com os instantes lado a lado (até 12), para ver o vídeo |
| `GET /api/v1/projetos/<id>/silencios?src=` | Duração e silêncios do arquivo, com a regra da Edição rápida: `{duracao, silencios, som}`; arquivo sem faixa de áudio (como o WebM do render) vem com `som: false` e nenhum silêncio |
| `POST /api/v1/projetos/<id>/html` `{nome, html, duracao, final?}` | Faz um WebM transparente do HTML e o guarda nos arquivos do projeto: `{arquivo: {id, nome, tipo, src}, largura, altura}` |
| `POST /api/v1/projetos/<id>/legenda` `{grupo, simular?, palavras?, semTexto?, fontes?, estilo?, final?, nome?}` | Legenda palavra a palavra do grupo, em WebM transparente: `{arquivo, duracao, largura, altura, palavras, trechos}`; com `simular`, só `{duracao, palavras, trechos}` |
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

A legenda (`src/legenda.ts`) junta a transcrição e o render. As palavras dos blocos que falam
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
faça depois dos cortes, e de novo se o grupo mudar. Até 60 s por grupo. O WebM entra com
`adicionar {arquivo, dur: duracao, sobre: grupo, em: 0}`.

`avisos`, em `ver_projeto` e na resposta dos comandos, aponta o que está aceito mas sairá errado.
Há dois. `rascunho` (`bloco`, `fala`, `segundos`): uma fala que ainda espera o vídeo. E `sem_video_de_base` (`grupo`, `de`, `ate`, `segundos`, a partir do começo do grupo),
quando uma cobertura ou um som passa do fim da sequência ou há um buraco nela. Aquele trecho sai
sobre o fundo preto, salvo se uma cobertura opaca o preencher.

Erro: `{"erro": "<código>"}`, com `comando` (a posição no lote) quando um comando é
recusado. Em `comando_desconhecido`, `sugestao` traz o tipo com o nome mais parecido
(`troca` → `trocar`) ou, se nenhum chega perto, `tipos` traz a lista. Quando o contêiner não responde (subindo, indo dormir ou ocupado), o site tenta de novo
sozinho duas vezes; se ainda falhar, `503 conteiner_falhou` em quadros, silêncios, transcrição,
HTML e legenda: tente de novo em instantes. Chamadas em paralelo esperam a vez no contêiner. Em
`quadros`, instante depois do fim mostra o último quadro. Em 409, `revisao` traz a atual: leia o projeto e refaça o lote.

## Comandos

| `tipo` | Campos | Efeito |
|---|---|---|
| `adicionar` | `video`, `arquivo` ou `ativo` (de `listar_avatares`); `nome`, `inicio`, `fim`, `semSom`; `dur` (obrigatório em vídeo e áudio de `arquivo` e de ativo enviado; o ativo gerado usa a duração do vídeo); `depois` ou `sobre` e `em` | Bloco novo. `depois`: entra logo depois daquele bloco e empurra o resto. `sobre`: cobre o grupo a `em` segundos (ou soma o som, se for áudio). Sem os dois: bloco solto, à direita de tudo. Vídeo de `arquivo` sem faixa de som (o WebM do render, uma animação) entra sem a camada de áudio, como com `semSom` |
| `rascunho` | `fala`, `duracao` (0,5 a 30); `nome`; `depois` ou `sobre` e `em`; `rotulo` | O lugar de um vídeo que ainda não existe: um bloco sem arquivo, com a fala, do tamanho estimado. Sem `nome`, Texto 1, Texto 2..., como os blocos. No canvas e na prévia, um cartão com a fala. A exportação é recusada enquanto houver rascunho |
| `trocar` | `bloco`; `video`, `arquivo` ou `ativo`; `inicio`, `fim`, `dur`, `nome`, `semSom` | Põe o arquivo no lugar do bloco (o vídeo pronto no lugar do rascunho): a posição e o que está por cima ficam, e a sequência acompanha a duração nova. Sem `fim`, o vídeo entra inteiro |
| `renomear` | `bloco`, `nome` | Muda o nome do bloco, como o campo Nome dos Ajustes |
| `cortar` | `bloco`, `inicio`, `fim` | Trecho do arquivo, em segundos; a sequência fica encostada |
| `dividir` | `bloco`, `em` | Dois blocos, no instante `em` do arquivo; 0,5 s no mínimo de cada lado |
| `mover` | `bloco`, `depois` ou `antes` | Muda a ordem, sem buraco; a cobertura e o som somado vão junto |
| `velocidade` | `bloco`, `velocidade` (0,25 a 4) | Mantém o tom da voz; o resto da sequência acompanha |
| `removerTrechos` | `bloco`, `trechos: [[inicio, fim], ...]` (até 200) | Tira esses trechos do arquivo (vícios, repetições, frases, pelos tempos da transcrição) e o resto encosta. Sobra menor que 0,5 s é recusada (`sobra_curta`): junte-a ao trecho do lado |
| `removerPausas` | `bloco` (sem ele, todos), `pausa` (`curta`, `media`, `longa`) | Tira as pausas com a regra da Edição rápida |
| `enquadrar` | `bloco`; `zoom` (1 a 8), `focoX`, `focoY` (0 a 1) ou `rosto: true`; `chaves: [{t, zoom, focoX, focoY}]`; `encaixe` (`preencher`, `caber`, `desfocar`); `recorte: {esquerda, topo, direita, base}`; `espelharH`, `espelharV`, `girar` (0, 90, 180, 270); `limpar` | Só muda o que vier. `t` é o tempo do bloco (negativo continua um movimento do bloco anterior); entre as chaves, a curva é suave |
| `ligar` | `de`, `para` | Liga blocos (ou um Final); recusa círculo, repetida e passar de 48 variações |
| `remover` | `ids`, `fechar` | Blocos, Finais ou linhas; com `fechar`, a sequência encosta |
| `som` | `bloco`, `volume` (0 a 4), `mudo` | Volume do bloco |
| `final` | `id`, `resolucao`, `formato`, `velocidade` | Muda um Final; sem `id`, cria outro. A velocidade vale para todas as variações dele |
| `organizar` | | O mesmo Organizar da tela |

Em `adicionar`, `rascunho` e `dividir`, `rotulo: "nome"` permite citar o bloco como `"@nome"` nos comandos
seguintes do mesmo lote, sem esperar a resposta.

O primeiro bloco de um projeto vazio traz o Final `final`, já ligado a ele, como na tela.
A resposta traz `criados`, com os ids novos na ordem dos comandos.

## Limites de agora

- A transcrição não acha sozinha os vícios e as repetições: quem decide é o agente, pelo texto.
- Os ativos de avatar entram pela API, mas o "Seus vídeos" do canvas ainda não os lista.
- Sem limite de uso por conta: exportar custa contêiner, e isso precisa de regra antes
  de abrir a outras contas.
- Velocidade e enquadramento ainda não têm campos nos Ajustes: só pela API, e a prévia mostra.
- O fundo desfocado da prévia não acompanha o zoom; o da exportação, sim.
- Vídeo WebM com transparência funciona como cobertura (`exportar.py` detecta o alfa), para
  legendas e gráficos feitos fora. Na prévia, depende do navegador.
