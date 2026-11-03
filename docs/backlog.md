# Backlog

O que falta fazer no meu.avatar, em ordem. Cada item vira um PR próprio, com a
sua migration quando precisar. Ao terminar um item, tire-o daqui (ou marque o
que ficou para depois) no mesmo PR.

## Direção (29/10/2026)

Gere aqui, edite aqui, publique aqui. Os vídeos vêm de APIs prontas (sem
construir a engenharia do zero), sempre buscando o menor custo; o trabalho de
construção vai para a UI/UX. Quem usa quer o resultado final, mesmo que mais
simples, e paga por ele: ganha dinheiro com os vídeos, criando audiência
ou fazendo anúncios no estilo UGC para marcas DTC. Ver "Direção" no `CLAUDE.md`. A ordem abaixo ainda é
a anterior e será revista com o dono por essa direção.

**Canvas de edição** (ver [canvas.md](canvas.md)): no ar para o administrador, com a
exportação de até 50 versões. Falta a timeline embaixo do canvas e abrir para todos, depois
de definir o limite de uso e o custo do contêiner por pessoa.

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

Com isso o agente faz pelo MCP a pesquisa, o roteiro, a estrutura com rascunhos, os cortes, a
legenda e os gráficos. Ainda não faz música, nem gera os vídeos (a pessoa gera no site).

O primeiro projeto feito do zero só pelo MCP (Proposta do Lara Resende, 02/11/2026) chegou à
estrutura completa com rascunhos e animações, e mostrou o que falta: a avaliação inteira do agente
está em [agente-avaliacoes.md](agente-avaliacoes.md), e o resumo é o item 1 abaixo. A ordem dos
itens ainda vai ser revista com o dono.

Próximos passos, nesta ordem:

1. **O que o teste da Lara Resende pediu** (detalhes em [agente-avaliacoes.md](agente-avaliacoes.md)):
   - *Respostas menores*: `editar_projeto`, no conflito, o que mudou; `ver_projeto` com filtros e
     o início de cada bloco no grupo; `listar_videos` com data e paginação; remover arquivos sem uso.
   - *Animação como código* (desenho de 02/11/2026, ainda não começado): o projeto guarda o
     código da animação, não o WebM pronto, e só renderiza o vídeo na exportação. Cobre a camada
     que acompanha o bloco, a prévia sem salvar, ler o HTML para editar e é a base dos templates
     com parâmetros. Desenho abaixo, em "Animação como código".
   - *Tempo que acompanha*: `sobre` ancorado no bloco (não só no grupo), encaixe do vídeo no
     rascunho cortando o silêncio, remover pausas acima de X s em todos os blocos com
     realinhamento; `ligar` e `remover` sem desfazer as variações sem querer. (A camada que
     acompanha o bloco quando ele muda de tamanho sai da animação como código.)
   - *Ver o resultado*: quadros do Final montado sem exportar. (A prévia e o HTML para editar saem
     da animação como código.)
   - *Pronto para usar*: templates de layout com parâmetros (sobre a animação como código), kit de
     marca por perfil, biblioteca de animações didáticas, preset de legenda numa chamada, onde fica
     o rosto de cada avatar, modelo de projeto com ganchos ligados ao corpo, música por URL ou da
     biblioteca do site.
2. **Fechar o HyperFrames**: modelos por marca (títulos, lower thirds, selos) e um projeto real
   feito só pelo MCP, do roteiro à exportação (o da Lara Resende está em andamento).
3. **Conector do claude.ai**: OAuth no MCP (por token, `/mcp` já funciona, ver [api.md](api.md)).
4. **Áudio**: fades, crossfade na emenda, ducking, efeitos sonoros, biblioteca de música
   licenciada ou geração por API (a do caso real foi sintetizada, só para teste),
   realce de voz por bloco e volume animado.
5. **Transições**: fusão, fade do preto, cortina, zoom, flash e transição em HyperFrames.
6. **Cor**: exposição, contraste, saturação, temperatura, LUT, igualar a cor entre vídeos,
   vinheta e nitidez.
7. **Tempo e imagem avançados**: rampa de velocidade, cortes em J e L, congelar, reverter,
   repetir, reenquadrar seguindo o rosto, tela dividida, picture-in-picture, opacidade,
   mistura, tremido e estabilização.
8. **Agente mais autônomo**: detectar cenas e o que aparece nelas, prévia rápida de um
   trecho, plano sem aplicar com o custo, desfazer pela API, histórico de versões, medir
   gancho, ritmo e áreas seguras.
9. **Entrega**: variações por plataforma, capa, limites por rede, presets e publicar direto.
10. **Abrir para todos**: limite de uso, custo do contêiner por pessoa e tela de tokens.

## Animação como código (desenho, 02/11/2026)

Hoje o `renderizar_html` faz o WebM na hora e o guarda no projeto: cada correção é um render novo
(15 a 90 s), o agente reenvia o HTML inteiro (3 a 5 mil caracteres por cena), o arquivo não
muda de tamanho com o bloco e os WebMs velhos se acumulam (mais de 30 no projeto da Lara Resende).
A ideia é guardar o código e renderizar só no fim, seguindo a direção de usar o que já existe (o
HyperFrames e o GSAP), sem pipeline novo.

- **Bloco de código**: um tipo de bloco novo no modelo do canvas (`src/canvas/modelo.js`), com o
  HTML (elementos, `<style>` e a linha do tempo `tl`), a duração e, depois, parâmetros (texto,
  cor, número). Entra por cima do vídeo como qualquer cobertura; a duração acompanha o bloco.
- **Prévia no canvas**: o próprio navegador roda o código num iframe com `sandbox` (sem acesso ao
  site), com as mesmas fontes e a mesma versão do GSAP da imagem de render, e o player leva a
  linha do tempo ao instante (`tl.seek`). Só a camada que está na tela roda, para não pesar.
- **Agente**: lê e edita o código guardado (sem reenviar tudo) e vê o resultado pelos quadros: o
  contêiner de render tira fotos da página nos instantes pedidos, sem fazer o vídeo (segundos, não
  minutos). É a prévia sem salvar e o "ler o HTML" do teste da Lara Resende.
- **Exportação**: antes de montar, o contêiner de render faz o WebM de cada bloco de código no
  tamanho e na duração finais, guardado pelo hash (código, parâmetros, tamanho, duração): a mesma
  animação não renderiza duas vezes. Depois, a emenda é a de hoje, com o WebM por cima.
- **Legenda**: o `legendar` já gera HTML; vira um bloco de código igual.
- **Cuidados**: a prévia tem de bater com o render (mesmas fontes e GSAP; o Chrome de quem usa
  pode diferir um pouco do da imagem); o código do agente roda no navegador de quem abre o canvas,
  por isso o `sandbox`; a exportação ganha um passo e espera os renders.

PRs, nesta ordem, um de cada vez:

1. Bloco de código no modelo e na API (`adicionar {html, duracao}`, ler e trocar o código), com a
   prévia no canvas.
2. Quadros do bloco de código para o agente, pelo contêiner de render.
3. Exportação: render dos blocos de código com cache pelo hash.
4. Legenda como bloco de código; o `renderizar_html` antigo fica para quem precisa do arquivo.
5. Parâmetros no bloco, base dos templates de layout.

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
   Primeiro candidato: Nano Banana 2.1 pelo OpenRouter (já usado no Aleph).
4. **Depois: interface de produção de texto e copy.** Transcrever o áudio do
   vídeo de referência (só o áudio, nunca o vídeo) e ajustar a fala.
5. **Configuração do administrador**: tela para trocar a plataforma do HeyGen
   (hoje pelo wrangler) e outras configs da tabela `config`.

## Ordem

1. **Testar outro modelo de vídeo com áudio próprio** (em andamento: HeyGen
   Avatar IV no ar para o administrador testar)
2. **Trocar avatar** (em andamento: Seedance 2.0, uso "Trocar avatar", pronto
   para o administrador testar; ver abaixo)
3. Voz gerada à parte e avatar falante (o HeyGen Avatar IV já faz isso numa
   chamada só; ver o item 1)
4. Convites do administrador
5. Esqueci a senha

## Onde estamos (25/10/2026)

No ar em <https://meuavatar.ia.br> (e no workers.dev). O que já funciona e
**não deve ser desfeito**:

- **Wan 3.0 pelo OpenRouter** como modelo padrão (`VIDEO_MODEL` no
  `wrangler.jsonc`), com o formulário em partes: estilo, fala, instruções e
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
- **Custo do Seedance**: ele cobra por tokens de vídeo, não por segundo; a
  regra de custo das estruturas (`CostRule`) hoje só conhece preço por
  segundo.
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

Só se nenhum modelo do item 1 entregar voz limpa. Gerar a voz num modelo de
voz (TTS do OpenRouter, `/api/v1/audio/speech`) e animar a foto com um modelo
que sincroniza a boca com o áudio: `heygen/avatar-iv` no OpenRouter
(US$ 0,05/s; aceita `voice_id` e `voice_settings`) ou o Seedance com áudio de
referência. É o que o Higgsfield faz no explainer narrado (voz à parte, juntada
depois). Muda mais o fluxo: duas chamadas e duas esperas por vídeo.

## 4. Convites do administrador

Hoje o primeiro cadastro vira admin e o cadastro fecha. O admin precisa
convidar outras pessoas. Portar do estuda.mais (`src/auth.ts` e o painel
`src/admin/`): links de convite de uso único com validade (72 h), tabela
`invites`, página para criar a senha pelo link e remover acesso. A tabela
`users` já tem `role` (`admin`/`member`) e aceita `password_hash` nulo
(convite não aceito).

## 5. Esqueci a senha

No estuda.mais é o mesmo link de convite, gerado de novo pelo admin. Para o
próprio admin, hoje o caminho é apagar a conta no D1 e cadastrar de novo
(`docs/operacao.md`). Fazer junto com o item 4.

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
