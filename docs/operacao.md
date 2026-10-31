# Operação

Como o meu.avatar roda, onde ficam as chaves e como publicar.

## Visão geral

```
Você no navegador ──▶ Worker "meu-avatar" (Cloudflare), com conta (e-mail e senha)
                        ├─ formulário: prompt, foto do avatar, duração, resolução, formato
                        ├─ R2 "meu-avatar": avatares/... (fotos) e videos/... (MP4 prontos)
                        ├─ D1 "meu-avatar": tabela videos (pedido, status, custo, erro)
                        └─ OpenRouter: POST /api/v1/videos (com callback_url)

OpenRouter ──aviso──▶ POST /openrouter/webhook
                        └─ confere o status na API; pronto: baixa o MP4 para o R2

A cada minuto ────▶ o mesmo Worker confere os vídeos ainda na fila
                     (rede de segurança se o aviso se perder)
                     e manda um vídeo pronto para o contêiner de áudio:
                     Contêiner "AudioFixer" (ffmpeg + DeepFilterNet 3)
                       └─ devolve o MP4 com o áudio tratado → R2 videos/<id>.tratado.mp4
```

## Tratamento do áudio

Pelo OpenRouter, o Wan 3.0 devolve a voz alta demais (−5 a −6 LUFS), cortada
e com chiado (medições em [docs/prompt.md](prompt.md)). Todo vídeo pronto passa
por um contêiner da Cloudflare (`container/`, classe `AudioFixer` em
`src/audio.ts`) que roda a receita "E2" de `container/tratar.sh`:

1. recupera os picos cortados (`adeclip`);
2. realce de voz por IA, DeepFilterNet 3, duas vezes;
3. corta graves inaudíveis, suaviza agudos e "s";
4. volume das redes: −14 LUFS, pico até −1,5 dBFS (duas passadas, só ganho).

O vídeo não é recodificado. O original fica em `videos/<id>.mp4` e o tratado
em `videos/<id>.tratado.mp4`; o estúdio mostra e baixa o tratado, com o
original no botão "Original". O agendamento trata um vídeo por rodada
(`audio_status`: pending → processing → done/failed); um tratamento que
passa de 20 minutos vira falha, e o vídeo fica com o original.

Custo medido (25 s em 720p): ~28 s de CPU e ~60 MB de memória, uns 2 min no
contêiner "basic" (1/4 de vCPU): ≈ US$ 0,001 por vídeo. A franquia do plano
pago (375 min de vCPU e 25 GiB·h de memória por mês) cobre uns 500 vídeos.

O contêiner não tem acesso à internet (`enableInternet = false`).

## Edição rápida

Botão "Edição rápida" no vídeo pronto das estruturas com `quickEdit` (hoje só
o HeyGen). O botão abre a **prévia**, no próprio navegador e sem gerar
arquivo: o script baixa o vídeo, acha os silêncios no áudio (Web Audio, pico
a cada 10 ms) e toca o vídeo sem as pausas, com o zoom de cada trecho (um
`scale` no vídeo). Pausas (curtas, médias, longas) e câmera (parada, zoom,
close) mudam a prévia na hora, com uma linha explicando a opção escolhida; as
regras estão em `src/quickedit.ts` e no `editar.py` (mudou uma, mude a outra).

A prévia não usa o player de vídeo. O HeyGen põe um quadro-chave só a cada
10 s, e pular o player de um trecho para o outro travava a imagem (até 0,7 s);
a versão seguinte, com dois players mudos se revezando, ainda dava trancos no
iPhone (Chrome e Safari usam o mesmo motor lá). Agora o script baixa o MP4 uma
vez e:

- o áudio vira um AudioBuffer (Web Audio): acha os silêncios e toca os trechos
  emendados, com 5 ms de fade nas pontas; ele é o relógio da prévia;
- um leitor de MP4 pequeno (no próprio script, sem biblioteca) tira as
  amostras H.264, com os quadros B (`ctts`) e a lista de edição (`elst`) para
  a boca bater com o som; o `VideoDecoder` (WebCodecs, iOS 16.4 em diante)
  decodifica em ordem, do começo, sem pular; os quadros das pausas cortadas
  são fechados na hora, e ficam no máximo 6 prontos na frente (o
  decodificador do celular tem poucos para emprestar);
- cada quadro vai para um `<canvas>` quando o relógio do som chega nele, com
  o mesmo recorte de zoom do contêiner, e é fechado. O zoom é uma
  transformação do canvas (`setTransform`) sobre o quadro inteiro: o recorte
  pelo `drawImage` com `VideoFrame` funciona no Chromium, mas o iPhone
  ignorou (a prévia tocava sem zoom).

Medido no Chromium (25 fps): 753 quadros em 30 s, sem quadro fora dos trechos
e a imagem a menos de 30 ms do som em 90% do tempo. Sem WebCodecs, a prévia
avisa e o vídeo editado sai do mesmo jeito. No iPhone, o som da prévia toca
mesmo no modo silencioso (`navigator.audioSession`). O script da prévia
(`PREVIEW_SCRIPT` em `src/site/site.ts`) só vai nas páginas com o botão.

"Gerar vídeo editado" manda os trechos da prévia e põe o vídeo na fila
(`edit_status`: pending → processing → done/failed; o plano fica em
`edit_plan`). O agendamento manda um por rodada para o mesmo contêiner
(`POST /editar`, plano no cabeçalho `x-plano`), que roda
`container/editar.py` com exatamente aqueles cortes. Se o navegador não
conseguir ler o áudio, vai só a escolha de pausas e câmera, e o contêiner
acha os silêncios sozinho. O que o `editar.py` faz:

1. corta os silêncios (pausas de mais de 0,25 s abaixo de −35 dB) com
   **ritmo orgânico**, em vez de deixar toda pausa do mesmo tamanho; some o
   silêncio do começo e do fim;
2. de tempos em tempos muda o enquadramento num corte (no "Close": aberto,
   médio 1,25×, aberto, close 1,5×), como se fossem duas câmeras; o zoom
   amplia em torno do ponto entre os olhos (veja abaixo): ele fica no mesmo
   lugar da tela no aberto e com zoom, e a linha dos olhos não pula no corte;
3. volume em −14 LUFS e pico até −1,5 dBFS (loudnorm linear).

**Rosto.** O contêiner acha o ponto entre os olhos (`container/rosto.py`):
detector YuNet do OpenCV nos quadros-chave do vídeo, em meia resolução, e
vale a mediana (não segue cada balanço da cabeça). O zoom amplia em torno
desse ponto (recorte em x = olhos × (largura − largura do recorte), o mesmo
na altura): os olhos ficam na mesma posição da tela no aberto, no médio e no
close, e o corte não faz a linha dos olhos pular. Pedir um instante qualquer do vídeo
obrigava o ffmpeg a decodificar desde o quadro-chave anterior (o HeyGen põe
um a cada 10 s): eram 67 s no contêiner; só com os quadros-chave, 3,8 s. A
prévia pede o rosto (`GET /videos/<id>/rosto`) junto com o vídeo; na primeira
vez o Worker manda o MP4 ao contêiner (`POST /rosto`, com a sua própria vez,
para não esperar uma edição) e guarda o resultado na coluna `face`. A edição
leva esse rosto no plano; sem ele, o `editar.py` acha sozinho. Sem rosto
achado, amplia em torno de onde os olhos costumam ficar (centro, a 22% da
altura).
A prévia espera o rosto até 6 s e segue com o padrão; se ele chegar depois,
o zoom passa a mirar nele.

**Partida a frio.** A biblioteca de contêineres espera 8 s pela instância e
20 s pela porta. Na primeira partida depois de um deploy, com a imagem de
~820 MB, isso não bastou (27/10/2026: o rosto não foi achado e o Worker
registrou "Can't read from request stream after response has been sent").
Agora o Worker espera até 2 min o contêiner subir antes de mandar o vídeo
(`ContainerAudio.ready`), e a detecção do rosto tenta de novo uma vez.

Medido: no vídeo do Ibovespa os olhos ficam em 0,50 × 0,23; no outro vídeo
do HeyGen, em 0,46 × 0,42 (a regra fixa de antes cortava mal esse). O OpenCV e
o numpy vão na imagem como rodas baixadas e conferidas pelo SHA-256
(`container/rodas/`, `baixar-binarios.sh`), e o modelo em `yunet.onnx`:
a imagem passou de ~490 MB para ~820 MB.

O ritmo orgânico (`planParts` em `src/quickedit.ts`, `ritmo` no
`editar.py`) parte de uma pausa de referência (Curtas 0,1 s, Médias 0,2 s,
Longas 0,35 s) e varia cada uma:

- a pausa que sobra segue a original, comprimida pela raiz (referência ×
  √(original ÷ mediana das pausas)): o fim de uma ideia continua respirando
  mais que uma vírgula;
- fala curta (menos de 1,2 s) de um dos lados ganha pausa extra, até mais
  uma de referência: blocos curtos não ficam espremidos;
- fica entre metade e 2,5 vezes a referência, nunca mais que a original; se
  sairiam menos de 0,08 s, não corta;
- 60% da pausa fica depois da fala e 40% antes da seguinte;
- a câmera só troca de enquadramento depois de 2,5 s no mesmo: os outros
  cortes ficam no enquadramento de antes.

No último vídeo do HeyGen (Médias, Close): as pausas, que antes ficavam
todas em 0,16 s, ficaram entre 0,17 e 0,34 s; 11 cortes e 6 trocas de câmera,
em vez de uma troca a cada corte; 40,2 s → 36,1 s.

Parte da versão com o áudio tratado, se houver. O editado fica em
`videos/<id>.editado.mp4`; o player passa a mostrar o editado, com "Ver
original" ao lado, e o botão continua lá para refazer com outras escolhas. Se
falhar, o motivo aparece em "Detalhes".
Uma edição que passa de 20 minutos vira falha.

Medido em 27/10/2026 no último vídeo do HeyGen (40 s, 720p, 9:16): 40,2 s →
35,0 s em 13 trechos; 2 min 34 s no contêiner com os limites do tipo "basic"
(`docker run --cpus 0.25 --memory 1g`). A prévia no Chromium achou 12 cortes
(35,2 s) e o contêiner, com esses trechos, entregou 35,3 s. Para testar sem o
site:
`python3 container/editar.py entrada.mp4 saida.mp4` (precisa de ffmpeg).

## Troca de avatar pelo Aleph 2

A estrutura `aleph` (`src/structures/aleph.ts`, receita e testes em
[docs/modelos/runway-aleph-2.md](modelos/runway-aleph-2.md)) não envia o pedido
na hora: o vídeo fica "Preparando" (`prep_status = 'pending'`, migration
`0009_prepare.sql`) e o agendamento prepara um por rodada
(`Studio.prepareNext`):

1. o contêiner corta as faixas pretas e amplia o vídeo até 1080p
   (`POST /preparar`, `container/aleph.py`) → R2 `origens/<id>.preparado.mp4`;
2. tira 5 quadros (`POST /quadros`, instantes no cabeçalho `x-instantes`) e
   recorta o rosto da foto (`POST /recorte`);
3. o Worker troca o rosto nos quadros (`google/gemini-nano-banana-2.1`, pelo
   chat), em cadeia: o primeiro que passa sai da foto e vira a referência de
   rosto e cabelo dos outros. O contêiner põe cada quadro no tamanho do vídeo
   (`POST /ajustar`) e um modelo de visão (`anthropic/claude-haiku-5.5`) confere
   se o fundo ficou igual ao do original e, na cadeia, se o cabelo é o da
   referência. Reprovado, refaz uma vez; de novo, o quadro fica de fora → R2
   `quadros/<id>/<n>.jpg`;
4. pede ao Aleph 2 com o vídeo preparado e os quadros-chave;
5. quando o Aleph devolve, a saída fica em `videos/<id>.aleph.mp4` e o vídeo
   aparece como "Finalizando" (`prep_status = 'compose'`). Na rodada seguinte, o
   contêiner compõe (`POST /compor`, os dois vídeos emendados no corpo, o tamanho
   do primeiro em `x-primeiro`): o preparado com só a cabeça e o cabelo do Aleph
   por cima → `videos/<id>.mp4`. Se a composição falhar ou passar de 20 minutos,
   o vídeo fica pronto com a saída pura do Aleph.

A composição vai um quadro por vez (a memória não cresce com a duração: uns
240 MB) e gastou 35 s de CPU para 5,5 s de vídeo: no contêiner "basic" (1/4 de
vCPU), uns 2,5 min; 30 s levariam uns 13 min.

O que o preparo gasta (≈ US$ 0,21 por vídeo nas imagens e conferências) fica
em `settings.prep_cost` e entra no custo do vídeo quando ele fica pronto. Um
preparo que passa de 20 minutos vira falha. Sem contêiner, a troca é recusada
no formulário. Para testar o contêiner sem o site: `YUNET=container/yunet.onnx
python3 container/aleph.py preparar entrada.mp4 saida.mp4` (precisa de ffmpeg,
OpenCV e numpy).

A foto do avatar, o vídeo de origem e os quadros-chave ficam públicos em
`/midia/avatares/`, `/midia/origens/` e `/midia/quadros/` (nomes impossíveis
de adivinhar), porque o provedor do vídeo baixa de lá. O resto pede login.

## Contas

Portadas do estuda.mais (`src/auth.ts`):

- **A primeira conta cadastrada é a do administrador** (`/cadastro`). Depois
  dela, o cadastro fecha: `/cadastro` mostra "Cadastro fechado" e recusa novos
  pedidos. Convidar outras pessoas é a próxima etapa (o estuda.mais já tem os
  links de convite prontos para portar).
- **Logo depois da primeira publicação, crie a conta do administrador.**
  Enquanto não houver conta, quem abrir o endereço primeiro vira o admin.
- A senha (10 a 64 caracteres) fica só como hash bcrypt (custo 12). Cinco
  senhas erradas seguidas bloqueiam a conta por 15 minutos.
- A sessão vale 30 dias, num cookie `__Host-sessao` (HttpOnly, Secure,
  SameSite=Strict); o banco guarda só o hash do código. Sair encerra a sessão
  no servidor.
- Todo formulário precisa vir do próprio site (cabeçalho Origin), as páginas
  não ficam em cache nem abrem dentro de outros sites, e o script da página só
  roda com o nonce da CSP.
- Esqueceu a senha? Por enquanto, apague a conta no D1
  (`npx wrangler d1 execute meu-avatar --remote --command "DELETE FROM users"`)
  e cadastre de novo: os vídeos continuam.

### Esta instalação

| O quê | Onde |
|---|---|
| Conta Cloudflare | a mesma do anb.bot (subdomínio `gilveloso.workers.dev`) |
| Worker | `meu-avatar`, em <https://meu-avatar.gilveloso.workers.dev> (no ar desde 25/10/2026) |
| Domínio | <https://meuavatar.ia.br> e www (domínios personalizados do Worker, no ar desde 25/10/2026; [detalhes](#o-domínio-meuavatariabr)) |
| Banco D1 | `meu-avatar` (o id está em `wrangler.jsonc`) |
| Bucket R2 | `meu-avatar` |
| Agendamento | a cada minuto (`triggers.crons` em `wrangler.jsonc`; era a cada 2 até 27/10/2026, e a edição rápida esperava até 2 min na fila) |
| Contêiner de áudio | `AudioFixer` (aplicação `meu-avatar-audiofixer`), tipo "basic", 1 instância (`containers` em `wrangler.jsonc`); no ar desde 25/10/2026. Primeiro vídeo tratado (25 s, 720p) em ~1 min 20 s, contando a partida do contêiner |

## Onde ficam as chaves

Nenhuma chave fica no repositório.

| Chave | Onde fica | Para quê |
|---|---|---|
| `OPENROUTER_API_KEY` | Segredo do Worker | Gerar e baixar os vídeos. Sem ela, o estúdio só mostra os vídeos já feitos |
| `OPENROUTER_WEBHOOK_SECRET` | Segredo do Worker (recomendado) | Segredo de assinatura do workspace no OpenRouter; com ele, avisos sem assinatura válida são recusados (401) |
| `HEYGEN_API_KEY` | Segredo do Worker e `.dev.vars` | API direta da HeyGen (o HeyGen Avatar IV com voz pronta, voz clonada ou o áudio da pessoa). **Vence em 27/01/2027**: gere outra em platform.heygen.com → API keys e troque nos dois lugares. Sem ela, o HeyGen segue pelo OpenRouter |
| `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` | Só onde você publica | Publicar, criar banco e bucket, cadastrar segredos |

## Trocar a plataforma do HeyGen

O HeyGen Avatar IV gera pelo OpenRouter ou pela API direta da HeyGen, pela
config `plataforma.heygen` do banco (tabela `config`, migração 0011). O
formulário mostra só o que a plataforma escolhida aceita; os vídeos já feitos
continuam consultados por onde foram feitos. Pela API direta: US$ 0,0385/s
(contra US$ 0,05/s pelo OpenRouter), saldo pré-pago na conta da HeyGen.

```bash
npx wrangler d1 execute DB --remote --command "UPDATE config SET value = 'heygen' WHERE key = 'plataforma.heygen'" < /dev/null
npx wrangler d1 execute DB --remote --command "UPDATE config SET value = 'openrouter' WHERE key = 'plataforma.heygen'" < /dev/null
```

No computador, troque `--remote` por `--local`. Com a config na HeyGen e sem a
`HEYGEN_API_KEY`, o HeyGen segue pelo OpenRouter (e o log avisa). Depois, a
troca vai para uma tela de configuração do administrador.

Configurações que não são segredo ficam em `vars`, no `wrangler.jsonc`:
`SITE_URL` e os padrões do formulário do Wan (`VIDEO_DURATION`,
`VIDEO_RESOLUTION`, `VIDEO_ASPECT_RATIO`). O modelo de cada formulário fica na
própria estrutura, em `src/structures/`.

## Publicar com o contêiner

`npm run deploy` roda `container/baixar-binarios.sh` (baixa o DeepFilterNet e
o ffmpeg estático do GitHub, conferindo o SHA-256) e o `wrangler deploy`, que
monta a imagem com Docker e manda para o registro da Cloudflare. Precisa do
Docker rodando (no ambiente cloud: `dockerd &`). A imagem não usa `apt`:
a rede do ambiente cloud bloqueia o `deb.debian.org`; a base vem do espelho
do Google (`mirror.gcr.io`), porque o Docker Hub limita downloads.

No ambiente cloud, a rede precisa liberar `registry.cloudflare.com` (para onde
o `wrangler deploy` manda a imagem), além de `api.cloudflare.com`.

O script roda no Linux e no Mac (no Mac ele confere com `shasum`, porque o
`sha256sum` de lá não tem `--quiet`). Sem Docker (o Mac do usuário não tem) e
sem mudança em `container/`, publique só o Worker, que mantém a imagem que já
está no ar (28/10/2026):

```bash
npx wrangler deploy --containers-rollout=none < /dev/null
```

Mudou algo em `container/`: aí precisa do `npm run deploy` com o Docker rodando.

Teste local da imagem (25/10/2026), com os limites do tipo "basic"
(`docker run --cpus 0.25 --memory 1g`): vídeo de 25 s em 720p tratado em
87 s; resultado igual ao E2 aprovado (correlação 1,000), −13,9 LUFS, sem
picos cortados e o vídeo idêntico byte a byte ao original.

## Exportação dos projetos

O contêiner `Exporter` (`container/Dockerfile.exportar`, `standard-3`) é separado do
de áudio: imagem só com ffmpeg, dorme 30 s depois do último pedido. Regras do R2
(uma vez só, para os arquivos não se acumularem):

```bash
npx wrangler r2 bucket lifecycle add meu-avatar trechos-30d trechos/ --expire-days 30 < /dev/null
```

```bash
npx wrangler r2 bucket lifecycle add meu-avatar exportacoes-2d exportacoes/ --expire-days 2 < /dev/null
```

Teste sem o contêiner (precisa de ffmpeg): `python3 container/exportar.py trecho
plano.json saida.mkv arquivo...` e `python3 container/exportar.py emendar saida.mp4
trecho.mkv...`.

Medido no Mac (31/10/2026), sem o contêiner: 50 versões de 16 s em 1080p, com vídeo
real (5 ganchos × corpo × 10 CTAs, 55 s de conteúdo único): 37 s com 4 threads na
codificação (14 s nos trechos, 23 s nas emendas, 0,5 s cada), 56 MB de trechos, 16 MB por
versão, ZIP de 798 MB.

Medido na imagem real (31/10/2026, ambiente cloud, Docker 29, máquina de 4 núcleos):
imagem de 434 MB no disco (118 MB comprimida), `GET /saude` responde 0,3 a 0,5 s depois
do `docker run` (imagem já baixada; a Cloudflare soma o download dela na partida fria).
`docker run --cpus N --memory M --network none`, pedidos pelo HTTP de verdade (`POST
/trecho` e `POST /emendar`, com `x-tamanhos`) por um script Python dentro do contêiner.
Mesmo teste do Mac: 5 ganchos de 3 s × corpo de 10 s × 10 CTAs de 3 s = 16 trechos e 50
versões de 16 s em 1080×1920; o corpo tem imagem, cobertura de vídeo e música. Duas
fontes de 25 s, 720×1280, 25 fps, H.264 e AAC, feitas com ffmpeg (`testsrc2` com ruído):

- **leve**, 4 Mbit/s, ruído de 4 (perto de um vídeo do avatar): trechos somam 49 MB,
  14 MB por versão, 676 MB enviados nas emendas e 682 MB de versões (o ZIP);
- **pesada**, 82 Mbit/s, ruído de 20 (o pior caso): trechos de 35 MB a cada 3 s (632 MB),
  168 MB por versão, 8,4 GB enviados nas emendas e 8,4 GB de versões.

| Instância | Fonte | Trechos | Emendas (média / máx.) | Total | Custo | Com os 30 s parado |
|---|---|---|---|---|---|---|
| `standard-4` (4 vCPU, 12 GiB, 20 GB) | leve | 17,9 s | 16,4 s (0,33 / 0,38 s) | 34 s | US$ 0,0038 | US$ 0,0072 |
| `standard-3` (2 vCPU, 8 GiB, 16 GB) | leve | 28,4 s | 16,6 s (0,33 / 0,36 s) | 45 s | US$ 0,0027 | US$ 0,0046 |
| `standard-2` (1 vCPU, 6 GiB, 12 GB) | leve | 59,4 s | 21,4 s (0,43 / 0,50 s) | 81 s | US$ 0,0029 | US$ 0,0040 |
| `standard-4` | pesada | 53,5 s | 62,3 s (1,24 / 1,29 s) | 116 s | US$ 0,0129 | US$ 0,0162 |
| `standard-3` | pesada | 98,6 s | 62,6 s (1,25 / 1,32 s) | 161 s | US$ 0,0099 | US$ 0,0117 |
| `standard-2` | pesada | 199,4 s | 79,9 s (1,59 / 1,75 s) | 279 s | US$ 0,0100 | US$ 0,0111 |

Custo pelo tempo total com a instância inteira cobrada: US$ 0,000020 por vCPU-s,
US$ 0,0000025 por GiB-s e US$ 0,00000007 por GB-s de disco. Memória: pico de 430 a
460 MiB (leve) e 800 a 830 MiB (pesada) no `docker stats`; com o cache de arquivos, que
o kernel devolve quando falta, 0,5 GB e 1,5 GB. Nenhuma instância chegou perto do limite.
Em todas as rodadas, as 50 emendas com `x-crc32` igual ao CRC-32 do arquivo e, em 3
versões por rodada, 480 quadros, vídeo e som com 16,000 s e decodificação até o fim sem
erro. O tempo dos trechos acompanha os núcleos; o das emendas quase não (é cópia e AAC).

Escolhido: `standard-3`. Custa cerca de 30% menos que o `standard-4` e leva 11 s a
mais nas 50 versões (45 s contra 34 s); 8 GiB sobram. O `standard-2` custa quase o mesmo
que o `standard-3` e demora quase o dobro.

## Primeira publicação

```bash
npx wrangler d1 create meu-avatar          # copie o database_id para o wrangler.jsonc
npx wrangler r2 bucket create meu-avatar
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put OPENROUTER_WEBHOOK_SECRET   # o mesmo do painel do OpenRouter
npm run db:migrar < /dev/null
npm run deploy
```

Se o primeiro `npm run deploy` subir o código mas falhar no fim com "This
Worker does not exist on your account" (aconteceu em 25/10/2026, com o
Worker novo), rode `npx wrangler triggers deploy`: ele liga o endereço
workers.dev e o agendamento.

Em seguida, abra o endereço e crie a conta do administrador. Confira se `SITE_URL` bate com o endereço que o deploy mostrar
(`https://meu-avatar.<subdomínio>.workers.dev`).

## O domínio meuavatar.ia.br

O domínio fica registrado no Registro.br, mas o DNS é da Cloudflare: é o que
permite ligar o domínio direto ao Worker (`routes` com `custom_domain` no
`wrangler.jsonc`; a Cloudflare cria os registros e o certificado sozinha).

1. No painel da Cloudflare: **Add a domain** → `meuavatar.ia.br`, plano Free.
   (O token do ambiente não tem a permissão de criar zonas.)
2. A Cloudflare mostra dois servidores DNS (`*.ns.cloudflare.com`). No
   Registro.br, em **DNS → Alterar servidores DNS**, troque pelos dois.
3. Quando a zona ficar **Active** na Cloudflare (minutos a algumas horas),
   `npm run deploy` liga `meuavatar.ia.br` e `www.meuavatar.ia.br` ao Worker.
4. `SITE_URL` é `https://meuavatar.ia.br`: é para lá que o OpenRouter manda os
   avisos e de onde baixa as fotos. O www redireciona para o endereço sem www.
   O workers.dev continua respondendo (avisos de vídeos pedidos antes da troca).

A sessão é por endereço: quem entrava pelo workers.dev entra de novo no domínio.

Ativado em 25/10/2026: zona `meuavatar.ia.br` (plano Free) com os servidores
`meg.ns.cloudflare.com` e `mike.ns.cloudflare.com`; o certificado do domínio
saiu uns 3 minutos depois do deploy. O token do ambiente não lê os registros
DNS da zona (falta a permissão "DNS: Read").

## Desenvolvimento

```bash
npm install
printf 'AMBIENTE=local\nOPENROUTER_API_KEY=...\n' > .dev.vars
npm run db:migrar:local
npm run exemplos   # opcional: vídeos de exemplo no banco local (precisa do ffmpeg)
npx wrangler dev --var SITE_URL:http://localhost:8787 --enable-containers=false
npm test
npm run typecheck
```

Em `localhost` o OpenRouter não alcança o Worker: a foto vai em base64 no
pedido e não há aviso. O vídeo aparece quando o agendamento conferir
(`wrangler dev --test-scheduled` e `curl "http://localhost:8787/__scheduled"`).

## Sem o Worker

`npm run gerar -- --prompt-arquivo prompt.txt --imagem avatar.jpg [--simular]`
gera direto do terminal e salva o MP4 em `saida/`.
