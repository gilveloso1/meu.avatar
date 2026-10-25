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

A cada 2 minutos ──▶ o mesmo Worker confere os vídeos ainda na fila
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

A foto do avatar fica pública em `/midia/avatares/<uuid>.jpg` (nome impossível
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
| Agendamento | a cada 2 minutos (`triggers.crons` em `wrangler.jsonc`) |
| Contêiner de áudio | `AudioFixer` (aplicação `meu-avatar-audiofixer`), tipo "basic", 1 instância (`containers` em `wrangler.jsonc`); no ar desde 25/10/2026. Primeiro vídeo tratado (25 s, 720p) em ~1 min 20 s, contando a partida do contêiner |

## Onde ficam as chaves

Nenhuma chave fica no repositório.

| Chave | Onde fica | Para quê |
|---|---|---|
| `OPENROUTER_API_KEY` | Segredo do Worker | Gerar e baixar os vídeos. Sem ela, o estúdio só mostra os vídeos já feitos |
| `OPENROUTER_WEBHOOK_SECRET` | Segredo do Worker (recomendado) | Segredo de assinatura do workspace no OpenRouter; com ele, avisos sem assinatura válida são recusados (401) |
| `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` | Só onde você publica | Publicar, criar banco e bucket, cadastrar segredos |

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

Teste local da imagem (25/10/2026), com os limites do tipo "basic"
(`docker run --cpus 0.25 --memory 1g`): vídeo de 25 s em 720p tratado em
87 s; resultado igual ao E2 aprovado (correlação 1,000), −13,9 LUFS, sem
picos cortados e o vídeo idêntico byte a byte ao original.

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
printf 'OPENROUTER_API_KEY=...\n' > .dev.vars
npm run db:migrar:local
npx wrangler dev --var SITE_URL:http://localhost:8787
npm test
npm run typecheck
```

Em `localhost` o OpenRouter não alcança o Worker: a foto vai em base64 no
pedido e não há aviso. O vídeo aparece quando o agendamento conferir
(`wrangler dev --test-scheduled` e `curl "http://localhost:8787/__scheduled"`).

## Sem o Worker

`npm run gerar -- --prompt-arquivo prompt.txt --imagem avatar.jpg [--simular]`
gera direto do terminal e salva o MP4 em `saida/`.
