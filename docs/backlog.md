# Backlog

O que falta fazer no meu.avatar, em ordem. Cada item vira um PR próprio, com a
sua migration quando precisar. Ao terminar um item, tire-o daqui (ou marque o
que ficou para depois) no mesmo PR.

## Prioridade: auditoria de 10/11/2026

O que a leitura do projeto inteiro achou e ficou para decidir ou fazer (o que era certo já foi
corrigido no mesmo PR). Vem antes do resto, nesta ordem.

### 1. Pode quebrar ou custar dinheiro

1. **Omni 1.1**: o Google passa o 1.1 para o 1.2 em **03/12/2026**: tirar `OMNI_11` antes dessa
   data (os vídeos dele ficam com a estrutura gravada). O 1.2 já tem os dois usos que o modelo
   aceita (com fala, a selfie sem instruções; sem fala, a cena sem pessoa; ver
   [modelos/gemini-omni-1.2-flash.md](modelos/gemini-omni-1.2-flash.md)); falta testar a cena com
   a foto de um produto e uma segunda foto de avatar.
2. **Listas cortadas em 100** (`ContaDb.videos`): `/videos`, a página do modelo e a biblioteca do
   canvas mostram só os 100 mais novos, sem paginação, e o contador diz "100" (`docs/layout.md`, item 11).
3. **Voz do avatar em M4A ou OGG**: o avatar aceita, o HeyGen direto recusa ao gerar (só MP3 e WAV,
   32 MB); o mesmo com vídeo WebM. Recusar ao salvar ou só oferecer o que o modelo aceita.
4. **Links sem token**: `/baixar/...mp3` liga o contêiner e grava no R2 no primeiro pedido (a regra
   é "só lê") e vale para conta suspensa; `/envio/<código>` aceita dois envios simultâneos; bilhete
   de envio não usado fica em `envios/` para sempre (falta a regra de expiração no R2).
5. **`listar_arquivos` do MCP** mostra na descrição todos os modelos, inclusive os de teste, a
   qualquer conta com API. Tirar a lista e apontar para o `listar_modelos`.
6. **Prazo de edição**: o contêiner corta em 10 min (15 na composição); o Worker e
   `docs/operacao.md` dizem 20. Escolher um.
7. **Simulação do agente mais fraca que a geração** (`check`, `src/studio.ts`): não confere a voz
   clonada do Fish nem o vídeo de origem; e a voz clonada é gravada antes da validação (sobra voz órfã).

### 2. Telas (aprovadas: mudar só com o sim do dono)

- FAB, chip de filtro e barra de busca com medidas diferentes das do `CLAUDE.md` (48, 36 e 44 px
  contra 56, 32 e 56).
- No diálogo "Salvar no avatar", a linha "N ativos" fica escondida no computador (`.vrow__support`).
- Dois formatos de dinheiro: "US$ 1.23" (custo estimado) e "US$ 1,23" (painel).
- Componentes copiados: card de linhas (4 cópias de `detailsCard`), página de confirmação de apagar
  (3), campo de busca (3), cabeçalho de lista dentro do `videoLibrary`.
- Detalhes da lista com `role="row"` sem tabela; o editor de fala não segura o limite de caracteres.
- Canvas: cada tecla é uma entrada no desfazer (100 no máximo); a prévia ignora a velocidade do
  Final nas animações e na prévia de grupo.

### 3. Ineficiente

- Agendamento: 13 idas ao banco por minuto mesmo sem fila (`scheduled`, `src/index.ts`); juntar a
  leitura das filas e passar os `failStale*` e o `deleteOldExports` para cada 5 a 15 min.
- Lista de modelos do OpenRouter buscada a cada pedido (4 buscas no `listar_modelos`); catálogo da
  HeyGen renovado dentro do pedido de uma página. Cache com prazo curto e renovação no agendamento.
- `tokenUser` grava a cada chamada da API; o `listar_arquivos` conta ativos de todo avatar só para ter o nome.
- Uns 155 KB de CSS e script embutidos em toda página, sem cache; a conferência de 20 s baixa a página inteira.
- API: o arquivo inteiro lido do R2 só para a duração (`duration`), `legendar` repetindo a
  transcrição por bloco, envio por `url` com 2 a 3 cópias na memória.
- Canvas: o player é recriado a cada quadro de um corte, e o projeto é reagrupado a cada
  movimento do mouse (`snap`, `playhead`).

### 4. Talvez não seja mais necessário

- `prototipos/acao-na-bolsa/` (scripts com caminhos de um computador, não rodam) e
  `prototipos/canvas/` (com `CONFIG.amostra`, `#reset` e `M.sample` no script de produção).
- Pipeline do Aleph 2 (quadros-chave, composição): é o que a Direção manda não construir, e custa
  4 instruções por minuto no agendamento. Manter como teste ou descartar.
- Sobras: campos de imagem e vídeo do formulário que nenhuma tela mostra (`fieldHtml`), parâmetros
  sem uso em seis funções do site, CSS sempre sobrescrito (`.player__controls`, `.quick-edit` base),
  `ERROS.vozFalhou` e `ERROS.ativoSalvar`, `base64` escrita quatro vezes, `Db.recentVideos` só nos
  testes, campos opcionais das exportações antigas (`src/exportar.ts`, sem uso depois de 17/11/2026).
- `README.md` descreve o projeto de 25/10 (só o Wan); o `npm run gerar` grava em `saida/` (a regra
  é `temp/`); `.npmrc` e `allowScripts` sem explicação.
- CI: conferir que `src/site/canvas.ts` está em dia, `py_compile` em `tools/`, `node --check` no
  contêiner de render e a paridade das 13 fontes (`src/render.ts` e `container/render/servidor.mjs`).
- Imagens: `RUN chmod` à parte nos dois Dockerfiles (deve dobrar o ffmpeg na imagem); a base da
  imagem de render sem digest fixo.

## Direção (29/10/2026)

Gere aqui, edite aqui, publique aqui. Os vídeos vêm de APIs prontas (sem
construir a engenharia do zero), sempre buscando o menor custo; o trabalho de
construção vai para a UI/UX. Quem usa quer o resultado final, mesmo que mais
simples, e paga por ele: ganha dinheiro com os vídeos, criando audiência
ou fazendo anúncios no estilo UGC para marcas DTC. Ver "Direção" no `CLAUDE.md`. A ordem abaixo ainda é
a anterior e será revista com o dono por essa direção.

**Canvas de edição** (ver [canvas.md](canvas.md)): no ar para o administrador, com a
exportação de até 48 versões. Falta abrir para todos, depois de definir o limite de uso e o
custo do contêiner por pessoa. A timeline embaixo do canvas saiu dos planos (05/11/2026).

**Agentes editando projetos** (ver [api.md](api.md)): a meta é um agente fazer uma edição de
nível profissional num projeto real. O caso de teste é o projeto "Ação na Bolsa". Cada item
precisa existir nos comandos, na exportação e na prévia do canvas.

Já feito (tudo no ar e conferido em 02/11/2026, ver [api.md](api.md)):

- Cortes e ritmo (dividir, inserir no meio, mover, aparar, velocidade, remover pausas), imagem
  (zoom, foco, recorte, espelhar, girar, encaixe, rosto, keyframes), ver quadros e silêncios
  (PRs 42 a 46).
- Transcrição com o tempo de cada palavra e `removerTrechos` para editar pelo texto (Whisper do
  Workers AI, PR 48) e os ativos de avatar nos projetos (`listar_avatares`, `adicionar {ativo}`, PR 49).
- Vídeo transparente do HTML do agente (`renderizar_html`, contêiner próprio com o HyperFrames e
  13 fontes livres, PR 50) e a legenda palavra a palavra pronta da transcrição (`legendar`, com
  as regras do caso real, PR 51).
- Rascunho no lugar de um vídeo que ainda não existe e `trocar` pelo vídeo pronto (PR 52), com a
  fala editável nos Ajustes do canvas.

No ar em 08/11/2026 (PRs 122 a 124): o agente **gera vídeo** com o HeyGen Avatar (`gerar_video`,
`acompanhar_video` e `listar_vozes`, ver [api.md](api.md)), e o **rosto das miniaturas e da prévia
da Edição rápida é achado no navegador** (MediaPipe), sem o contêiner; o servidor só procura no
`rosto` do agente.

No ar em 10/11/2026 (PRs 139 e 140): o agente usa **todos os modelos sem ferramenta por modelo**
(`listar_modelos` e um `gerar_*` por tipo, com `modelo` obrigatório e em dois passos: simula e mostra
o custo, e só gera com a confirmação da pessoa; ver "Gerar" em [api.md](api.md)); entram o Wan 3.0
livre (quadros, referências, som e semente) e o mischief 1 (o vídeo mais barato, só 16:9).

Também no ar (04/11/2026), a **animação como código** (PRs 69 a 83; ver [canvas.md](canvas.md) e
[api.md](api.md)): o projeto guarda o HTML da animação, não o WebM, e só renderiza na exportação.

- O bloco de código (`adicionar {html, duracao}`, `editarCodigo`, `incluir: codigo`), com a prévia
  no canvas num iframe com `sandbox`; a duração acompanha o bloco.
- `inspecionar_animacao`: a geometria em texto em cada instante, com os problemas (título que
  quebrou, elemento cortado, texto sobre texto, parâmetro sem valor); os quadros só se pedidos.
- O render na exportação, guardado pelo hash (a mesma animação não renderiza duas vezes).
- A legenda do `legendar` como animação em código, e os parâmetros no bloco (`parametros`, campos
  nos Ajustes).
- `listar_animacoes` e `adicionar {animacao}`: o agente parte do que já fez no projeto ou no
  avatar; de outro avatar, pergunta antes ("Reusar animações" em [api.md](api.md)).

O `renderizar_html` fica para quem precisa do arquivo.

Com isso o agente faz pelo MCP a pesquisa, o roteiro, a estrutura com rascunhos, os cortes, a
legenda e os gráficos, e gera os vídeos, as imagens e os áudios (`gerar_*`). Ainda não faz música.

O primeiro projeto feito do zero só pelo MCP (Proposta do Lara Resende, 02/11/2026) chegou à
estrutura completa com rascunhos e animações, e mostrou o que falta: a avaliação inteira do agente
está em [agente-avaliacoes.md](agente-avaliacoes.md), e o resumo é o item 1 abaixo. A ordem dos
itens ainda vai ser revista com o dono.

Próximos passos, nesta ordem:

1. **O que o teste da Lara Resende pediu** (detalhes em [agente-avaliacoes.md](agente-avaliacoes.md)):
   - *Tempo que acompanha* (feito em 05/11/2026, ver "Camadas que acompanham" em [api.md](api.md)):
     o `em` do `sobre` conta do bloco citado, a camada segue o ponto da fala quando o bloco de baixo
     é cortado, acelerado ou perde pausas e trechos, o `trocar` tira o silêncio das pontas e leva a
     camada na proporção, e o `removerPausas` aceita `acima` em segundos. A animação em código
     estica ou encolhe com a fala (feito em 05/11/2026). Faltam o mesmo acompanhamento nos cortes feitos
     na tela do canvas, um aviso quando um corte tira o ponto em que a camada começava (hoje ela vai
     para o começo ou o fim do bloco, calada) e apagar um projeto pelo MCP (o teste de 05/11/2026
     deixou o projeto "Teste MCP tempo (agente) 05/11" na conta).
   - *Ver o resultado* (feito em 09/11/2026): `ver_cena` mostra quadros de uma cena montada como na
     exportação, com todas as camadas, sem exportar o vídeo (a animação sozinha também se vê pelo
     `inspecionar_animacao`).
   - *Pronto para usar*: em vez de templates adivinhados, o agente reusa o que já fez (feito,
     acima). Faltam: kit de marca por perfil, preset de legenda numa chamada, onde fica
     o rosto de cada avatar, modelo de projeto com ganchos ligados ao corpo, música da biblioteca do
     site (por URL já entra: `enviar_arquivo {url}`).
2. **Fechar o HyperFrames**: um projeto real feito só pelo MCP, do roteiro à exportação (o da Lara
   Resende está em andamento). Os modelos por marca (títulos, lower thirds, selos) saem do reuso:
   o que um agente fizer para a marca, o próximo copia.
3. **Conector do claude.ai**: OAuth no MCP (por token, `/mcp` já funciona, ver [api.md](api.md)).
4. **Áudio**: as falas de áudio já se encadeiam e perdem pausas e trechos como o vídeo (09/11/2026,
   "Sequências" em [api.md](api.md)). O som da exportação ficou limpo (09/11/2026, PRs 135 a 137, ver
   "Exportar" em [canvas.md](canvas.md)): sem buraco nem estalo nas emendas (a música cortada por cena
   continua sem salto, até 2x), e o volume no molde dos editores: cada arquivo de som a −14 LUFS, a
   música no volume do canvas em todas as cenas e um ajuste só no vídeo inteiro. Cada versão também
   sai só o som, em MP3 (10/11/2026), para a fala montada no canvas virar o "Meu áudio" do HeyGen
   (no `gerar_video {audio}`, direto). Depois: fades, ducking, efeitos sonoros, biblioteca de música
   licenciada ou geração por API (a do caso real foi sintetizada, só para teste),
   realce de voz por bloco e volume animado.
5. **Transições**: fusão, fade do preto, cortina, zoom, flash e transição em HyperFrames.
6. **Cor**: exposição, contraste, saturação, temperatura, LUT, igualar a cor entre vídeos,
   vinheta e nitidez.
7. **Tempo e imagem avançados**: rampa de velocidade, cortes em J e L, congelar, reverter,
   repetir, reenquadrar seguindo o rosto, tela dividida, picture-in-picture, opacidade,
   mistura, tremido e estabilização.
8. **Agente mais autônomo**: detectar cenas e o que aparece nelas, prévia rápida de um
   trecho, plano sem aplicar com o custo, desfazer pela API, histórico de versões (com ele, o
   conflito do `editar_projeto` pode dizer o que mudou peça a peça), medir gancho, ritmo e áreas
   seguras.
9. **Entrega**: variações por plataforma, capa, limites por rede, presets e publicar direto.
10. **Abrir para todos**: limite de uso, custo do contêiner por pessoa e tela de tokens.

## Recriar um vídeo de referência com outra personagem (29/10/2026)

O desafio: a pessoa tem um vídeo de referência (ex.: review UGC de um produto)
e quer o mesmo vídeo com outra personagem, sem subir o vídeo original para
nenhum modelo. O básico realista resolve: a personagem falando, com os
produtos em cena; sem títulos ou texto na geração e sem o "pega e mostra".

1. **HeyGen pela API direta, com três vozes** (feito: voz pronta, voz clonada
   e o áudio da pessoa; troca de plataforma pela config do banco, ver
   `docs/operacao.md`). Testado com a chave de verdade nas três vozes (ver
   `docs/modelos/heygen-avatar-iv.md`). No ar desde 30/10/2026, só para o
   administrador.
2. **Tela Avatares** (feito): guarda os ativos de cada avatar (fotos, vídeos,
   áudios) e não depende de nenhum modelo. Os modelos geram por arquivo solto
   ou por avatar (`videos.avatar_id`), e "Salvar no avatar" leva o vídeo pronto
   para os ativos. A voz do avatar entra na lista de vozes clonadas e é clonada no primeiro uso.
   "Avatar e ativos" no painel do modelo: escolher o avatar e, um a um, os ativos dos tipos
   que o modelo aceita. Falta: gerar um vídeo real com avatar e voltar ao formulário do
   modelo depois de criar um avatar por "Novo avatar".
3. **Modelo de imagem** (um card em "Modelos"): gera a imagem inicial, por
   exemplo a personagem da pessoa na cena de um print do vídeo de referência.
   Com ou sem foto de referência. Escolhido o Nano Banana 2.1 pelo OpenRouter (comparação de
   06/11/2026 em `docs/modelos/gemini-nano-banana-2.1.md`, US$ 0,04 por imagem). Estrutura `imagem.ts` (`nano-banana`), só para o administrador:
   a imagem sai na hora e fica na lista do modelo; "Salvar no avatar" a leva para os ativos.
   O agente também gera pelo MCP (`gerar_imagem`, com até 6 referências em `referencias`, desde
   10/11/2026) e põe no canvas (`adicionar {imagem}`).
   Falta: liberar para todos; mais de uma referência no formulário do site (rosto e cena juntos).
4. **Vozes dos personagens** (pedido de 08/11/2026): modelos de fala com card e painel próprios,
   que geram áudio; o áudio entra no HeyGen como "Meu áudio" (pelo "Adicionar ativo") e vira o
   vídeo falado. Feito: o áudio como tipo de saída (`output: "audio"`, na lista do modelo, na
   página do áudio, no "Adicionar ativo" e no `listar_arquivos`, com `adicionar {audio}`) e o
   ElevenLabs v4 e o Fish Audio Drama 3, com as vozes oficiais do Fish (`voz.ts`, só para o
   administrador; ver `docs/modelos/`), o Texto com emoções (`#`) e o `gerar_audio` do MCP. Falta, um PR por vez:
   - **Voz clonada no ElevenLabs**: só pela API direta dele (conta e chave próprias). A do Fish está
     feita (Voz clonada, como a da HeyGen; ver `docs/modelos/fish-audio-drama-3.md`).
   - O "Usar para gerar" do áudio abrir o HeyGen (o agente já gera a fala com `gerar_audio` e a usa
     no `gerar_video {audio}`).
   - **Prévia de voz rápida, em todos os modelos com voz** (HeyGen, ElevenLabs, Fish): hoje a primeira
     escuta de cada voz leva de 1 a 3 s (busca ou gera a amostra; depois fica no R2 e no navegador).
     Pré-carregar as amostras das vozes à vista quando o menu abre, começar a carregar ao passar o
     mouse no ▶ e mandar o áudio enquanto é lido (do R2, sem esperar o arquivo inteiro).
5. **Depois: interface de produção de texto e copy.** Transcrever o áudio do
   vídeo de referência (só o áudio, nunca o vídeo) e ajustar a fala.
6. **Configuração do administrador**: tela para trocar a plataforma do HeyGen
   (hoje pelo wrangler) e outras configs da tabela `config`.

## Ordem

1. **Testar outro modelo de vídeo com áudio próprio** (em andamento: HeyGen
   Avatar IV no ar para o administrador testar)
2. **Trocar avatar** (em andamento: Seedance 2.0, uso "Trocar avatar", pronto
   para o administrador testar; ver abaixo)
3. Voz gerada à parte e avatar falante (em andamento: o ElevenLabs gera a fala e o HeyGen
   anima a foto com ela; ver "Vozes dos personagens", acima)
4. **Seedance: corrigir o 2.0 e adicionar o 2.5, para os vídeos permitidos** (pedido de
   10/11/2026). Hoje a estrutura (`src/structures/seedance.ts`) só tem o uso "Trocar avatar", que a
   ByteDance recusa (rosto que pareça real, na foto ou no vídeo; ver
   [modelos/seedance-2.0.md](modelos/seedance-2.0.md)): o card do modelo só leva a um pedido que
   falha. Trocar por usos que o provedor aceita (sem rosto realista na entrada: cenário, objeto,
   personagem estilizado), sem contornar o filtro, e pôr o Seedance 2.5 (`bytedance/seedance-2.5`,
   de 4 a 30 s) como versão do mesmo modelo, com a mesma regra. Conferir a estimativa de custo
   (por tokens) no primeiro vídeo pronto: é o único modelo sem custo real para comparar
   ([modelos/README.md](modelos/README.md)).

## Onde estamos (25/10/2026)

No ar em <https://meuavatar.ia.br> (e no workers.dev). O que já funciona e
**não deve ser desfeito**:

- **Wan 3.0 pelo OpenRouter** como modelo padrão (`src/structures/wan.ts`), com o formulário em partes: estilo, fala, instruções e
  idioma (`src/prompt.ts`, explicado em `docs/prompt.md`).
- **Tratamento do áudio no contêiner** (`src/audio.ts`, `container/`): todo
  vídeo pronto passa pela receita "E2" (recupera os picos, realce de voz por
  IA duas vezes, suaviza agudos, −14 LUFS). O original fica guardado ao lado
  (`/videos/<id>.original.mp4`). Explicado em `docs/operacao.md`.
- Contas (primeiro cadastro vira admin), webhook assinado do OpenRouter,
  domínio próprio.
- **Uma estrutura por modelo** (`src/structures/`): a tela inicial tem um card
  por modelo, com a aba Vídeos ao lado (todos os vídeos, com filtro por
  status); a página do modelo tem três painéis: configuração, o vídeo
  escolhido com a caixa da fala, e os vídeos daquele modelo. Cada vídeo guarda a estrutura que o gerou. Hoje: Wan 3.0 (para todos), HeyGen Avatar
  IV e Seedance 2.0, com o uso "Trocar avatar" (em teste, só o administrador).

O problema que motiva o item 1: pelo OpenRouter, o Wan 3.0 devolve a voz alta
demais, cortada e com chiado. O mesmo modelo no Higgsfield sai limpo (os
arquivos mostram o mesmo produtor e nenhum tratamento depois), então a
diferença está na configuração com que a Alibaba é chamada, que o OpenRouter
não expõe. Pedir voz baixa no prompt não resolveu. O tratamento no contêiner
deixa o volume certo e tira os picos, mas o chiado faz parte da própria voz
gerada e não sai por completo.

| Vídeo (Wan 3.0) | LUFS | Pico | Clipping | Acima de 3 kHz |
|---|---|---|---|---|
| OpenRouter, 480p (pior caso) | −4,8 | +1,3 | 11,75% | 4,7% |
| OpenRouter, 720p | −6,2 | +1,4 | 6,49% | 6,2% |
| OpenRouter, 720p, depois do contêiner | −13,9 | −4,9 | 0% | 2,2% |
| **Higgsfield, 480p (a referência)** | −13,8 | −0,3 | 0,15% | 1,7% |

## 1. Testar outro modelo de vídeo com áudio próprio

Descobrir se algum outro modelo do OpenRouter entrega a voz limpa já na
origem. **Sem desfazer nada**: o Wan continua como está, com o contêiner
tratando o áudio dele.

### Agora: HeyGen Avatar IV, pelo estúdio

Escolhido pelo dono por custar o mesmo que o Wan em 480p (US$ 0,05/s) e trazer
a voz de um texto para fala, sem o chiado que nasce na voz do Wan. Está no ar
como estrutura própria (`src/structures/heygen.ts`, explicada em
`docs/prompt.md`), visível só para o administrador.

Próximos passos:

1. O dono gera um vídeo com a mesma fala e a mesma foto do vídeo de referência
   do Wan e ouve.
2. Medir o áudio como veio (`python3 tools/medir-audio.py`) e comparar com a
   tabela acima.
3. Conferir a imagem: lip sync, rosto igual ao da foto, olhar fixo.
4. Se ganhar: liberar para todos (`access: "all"`). Se a voz pedir ajuste,
   ligar o contêiner só para ele (`treatAudio`).

### Candidatos

Valores de `GET https://openrouter.ai/api/v1/videos/models` em 25/10/2026
(confira de novo antes: mudam).

| Modelo (id no OpenRouter) | Duração | Resolução | 9:16 | Primeiro quadro | Preço com áudio |
|---|---|---|---|---|---|
| `bytedance/seedance-2.5` (**começar por este**: é o padrão do Higgsfield para vídeo) | 4 a 30 s | 480p, 720p | sim | sim | por tokens de vídeo (US$ 0,0000107/token); sem preço por segundo |
| `kwaivgi/kling-v3.0-pro` | 3 a 15 s | 720p | sim | sim | US$ 0,168/s (15 s ≈ US$ 2,52) |
| `google/veo-3.1-fast` | 4, 6 ou 8 s | 720p, 1080p, 4K | sim | sim | US$ 0,10/s em 720p (8 s ≈ US$ 0,80) |
| `google/gemini-omni-1.2-flash` (estrutura `omni`, só para o administrador, desde 07/11/2026; ver [docs/modelos/gemini-omni-1.2-flash.md](modelos/gemini-omni-1.2-flash.md)) | 3 a 15 s | 360p, 720p, 1080p, 4K | sim | sim | US$ 0,07/s em 720p (8 s ≈ US$ 0,56) |
| `google/veo-3.1` | 4, 6 ou 8 s | 720p, 1080p, 4K | sim | sim | US$ 0,40/s (8 s ≈ US$ 3,20) |

O Seedance 2 em diante também aceita **áudio de referência**
(`input_references` com `audio_url`), o único no OpenRouter que aceita: abre
caminho para mandar uma voz pronta e o modelo sincronizar a boca.

### Como testar

1. **Gastar créditos só com autorização do dono**, um modelo por vez, e
   mostrar o custo estimado antes.
2. **Mesma comparação para todos**: a mesma foto e a mesma fala do vídeo de
   referência do Wan (`id 43d41b41-fa08-4305-8113-8ba7f3262701` no D1: a foto
   está em `image_key` e o prompt exato em `request_prompt`). Para modelos de
   até 8 ou 15 s, cortar a fala para caber (2,2 a 2,6 palavras por segundo).
3. **Primeiro pelo terminal**, sem mexer no estúdio: `npm run gerar --
   --modelo <id> --duracao <s> --resolucao 720p --imagem <foto> --prompt-arquivo
   <prompt>` (com `NODE_USE_ENV_PROXY=1` no ambiente cloud). O `--simular`
   mostra o pedido e o custo antes. A foto pode ser baixada do R2 com
   `npx wrangler r2 object get meu-avatar/<image_key> --remote --file foto.jpg`.
4. **Medir o áudio como veio do modelo**, antes de qualquer tratamento:
   `python3 tools/medir-audio.py <vídeos>` (LUFS, pico, clipping, tom e
   energia acima de 3 kHz) e comparar com a tabela acima.
5. **Ouvir**: mandar os vídeos ao dono. Ele decide de ouvido; os números só
   ajudam. Ele escolheu o tratamento "E2" assim.
6. **Conferir também a imagem**: lip sync, rosto igual ao da foto, olhar fixo e
   câmera parada (estilo Selfie). Não adianta voz limpa com rosto diferente.

### Para cada modelo novo

- **Uma estrutura nova** em `src/structures/`, com os seus campos, o seu
  prompt de sistema (ver o guia de prompt do modelo antes de reaproveitar o
  do Wan), a montagem do pedido e se o áudio passa pelo contêiner (decidir
  medindo). Começa com `access: "admin"`.
- Testes para cada comportamento novo (`test/`, com a API falsa).

## 2. Trocar avatar

Trocar só a pessoa de um vídeo pronto pela de uma foto, mantendo cena, câmera,
gestos e fala. Escolhido o Seedance 2.0 (`bytedance/seedance-2.0`): recebe o
vídeo e a foto como referências. Está na estrutura do Seedance
(`src/structures/seedance.ts`, explicada em `docs/prompt.md`) como a opção
"Trocar avatar" do campo Uso, para o modelo servir a outros usos depois;
visível só para o administrador. O vídeo vem do computador (MP4 ou MOV, de 2 a 15 s).

**28/10/2026: o Seedance recusa vídeo com rosto realista** (regra da
ByteDance; a estrutura fica como está, para outros usos). O teste seguiu pelo
Runway Aleph 2, pelo terminal: mantém o áudio original e, no terceiro teste
(vídeo vertical ampliado e 5 quadros-chave com o rosto grande e nítido), trocou
o avatar. Receita, custos e testes em [docs/modelos/runway-aleph-2.md](modelos/runway-aleph-2.md).

Próximos passos:

1. Testar com um vídeo de origem nítido, em 1080p de verdade (o teto de
   qualidade hoje é o vídeo de origem; quadros-chave em 2K não melhoraram e um
   deles criou um erro no fundo; vale a receita do terceiro teste).
2. Estrutura do Aleph 2 no ar desde 29/10/2026 (`src/structures/aleph.ts`, só o
   administrador; migration 0009 e o contêiner novo publicados): falta gerar o
   primeiro vídeo pelo site e confirmar a cobrança (US$ 1,40 por pedido nos
   testes) antes de ajustar a estimativa do formulário. Primeiro vídeo feito
   (US$ 1,62); quadros-chave em cadeia e composição com o original entraram
   depois. O dono ainda não está satisfeito: o próximo passo, se for preciso,
   é testar um modelo de substituição de personagem (Wan 2.2 Animate, Kling O3)
   fora do OpenRouter. O Seedance fica como
   está, para outros usos.
3. Botão "Trocar avatar" na página do vídeo, que abre o formulário já com
   aquele vídeo.

## 3. Voz gerada à parte e avatar falante

Em andamento (08/11/2026): o ElevenLabs v4 gera a fala pelo TTS do OpenRouter
(`/api/v1/audio/speech`, estrutura `voz.ts`) e o HeyGen pela API direta anima a foto com ela
("Meu áudio"). Outras opções para sincronizar a boca com o áudio: `heygen/avatar-iv` no OpenRouter
(US$ 0,05/s; aceita `voice_id` e `voice_settings`) ou o Seedance com áudio de
referência. É o que o Higgsfield faz no explainer narrado (voz à parte, juntada
depois). Muda mais o fluxo: duas chamadas e duas esperas por vídeo.

## Contas e permissões (aprovado em 07/11/2026, feito)

Antes de entrar a segunda pessoa, cada conta precisa ver só o que é dela, conferido no banco
e não tela por tela. Tudo o que existe hoje é do administrador (no ar, nenhum vídeo sem dono).

- **Feito:** `ContaDb` (`db.conta(userId)`, `src/db.ts`): toda consulta leva `user_id = ?1`
  (`test/dono.test.ts` confere). O site lê os vídeos por ela: listas, contagem, página,
  arquivos, rosto, edição rápida, Refazer, Salvar no avatar e "Adicionar ativo". O administrador
  abre o vídeo de outra conta só para ver (o painel leva às falhas), sem agir nele. Canvas, API,
  MCP e exportação também: a lista do canvas, o `listar_arquivos`, os vídeos e imagens que entram
  num projeto, quadros, silêncios, transcrição, o rosto e a exportação são só da conta dona do
  projeto. O Canvas já pode abrir para os membros (falta o limite de uso, acima).
  No banco (`migrations/0018_dono.sql`): gatilhos recusam vídeo sem dono e ativo de avatar ligado a
  vídeo de outra conta, e o índice `videos_by_user` serve as listas de cada conta.
  Permissões (`src/permissoes.ts`, no molde do TabNews): catálogo fechado e `pode()`, com
  `:outros` para o que é de outra conta; os papéis são pacotes no código, e cada conta tem
  ajustes em `users.permissoes` (testador, `-usar:canvas`, `suspensa`). O CHECK de `users.role`
  ficou: tirá-lo exige refazer a tabela, e no D1 isso apagaria em cascata sessões, projetos e
  avatares. Os ajustes cobrem o que um papel novo cobriria.
  Convites (porte do estuda.mais): aba **Contas** do painel (`gerenciar:contas`), link de uso
  único por 72 horas (`invites`, migration 0020), "Link de nova senha" para quem esqueceu e
  `npm run link-senha` para o administrador; suspender, reativar, testador e Canvas por conta.
- **Ideias para depois:** renovar a sessão a cada uso (o TabNews renova; aqui ela vence em 30
  dias de qualquer jeito), "Trocar a senha" no menu do perfil e o custo do bcrypt (12; o TabNews
  usa 14), medindo antes o tempo de CPU do login no Worker.

## Painel do administrador (04/11/2026)

Fora da ordem acima, pedido pelo dono: uma página com os números do site, só para o administrador.

1. **A página** (feito): `/painel`, pelo menu do perfil, com as abas Visão geral e Custos (gasto
   por modelo, vídeos, falhas, projetos e contas, do próprio banco), em 7 dias, 30 dias ou tudo.
   404 para quem não é administrador.
2. **Custos de fora** (feito): na aba Custos, um card por provedor de vídeo com o saldo e o gasto
   no período em destaque (OpenRouter: saldo pela chave de gestão `OPENROUTER_MANAGEMENT_KEY`;
   HeyGen: saldo da carteira ou do plano; o gasto no período vem do banco, pelo provedor de cada
   vídeo) e a Cloudflare (contêineres pelo painel do alarme, até 30 dias, e o R2).
3. **Saúde e atividade** (feito): aba Atividade com as falhas do período (vídeo, áudio, edição
   rápida e exportação, com o motivo técnico e o link), o estado do alarme de contêiner e os tokens
   de API e MCP com o último uso.
4. **Cloudflare Access** na frente de `/painel*` (código por e-mail antes de chegar ao Worker):
   configurado pelo dono no painel da Cloudflare, sem código.

## Pendências pequenas

- **Canvas**: o "Seus vídeos" da tela só lista vídeos gerados; os ativos de avatar entram pela
  API e aparecem na prévia, mas a tela ainda não tem onde escolhê-los.
- **Canvas**: velocidade e enquadramento ainda não têm campos nos Ajustes (só pela API, a prévia
  mostra), e o fundo desfocado da prévia não acompanha o zoom (o da exportação, sim).

- **`www.meuavatar.ia.br`**: configurado na Cloudflare com certificado
  próprio, mas não deu para conferir do ambiente cloud (o proxy recusa).
  Conferir no navegador que redireciona para `https://meuavatar.ia.br`.
- **Token da Cloudflare**: sem as permissões de criar zona e de ler DNS.
  Só faz falta para diagnóstico.
- **"Na fila" sem "gerando"**: o OpenRouter não passa pelo status
  `in_progress` no Wan; o cartão mostra os minutos de espera (o 720p leva uns
  10 min) para não parecer travado.
