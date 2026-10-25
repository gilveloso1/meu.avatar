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
```

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

## Onde ficam as chaves

Nenhuma chave fica no repositório.

| Chave | Onde fica | Para quê |
|---|---|---|
| `OPENROUTER_API_KEY` | Segredo do Worker | Gerar e baixar os vídeos. Sem ela, o estúdio só mostra os vídeos já feitos |
| `OPENROUTER_WEBHOOK_SECRET` | Segredo do Worker (recomendado) | Segredo de assinatura do workspace no OpenRouter; com ele, avisos sem assinatura válida são recusados (401) |
| `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` | Só onde você publica | Publicar, criar banco e bucket, cadastrar segredos |

Configurações que não são segredo ficam em `vars`, no `wrangler.jsonc`:
`SITE_URL` e os padrões do formulário (`VIDEO_MODEL`, `VIDEO_DURATION`,
`VIDEO_RESOLUTION`, `VIDEO_ASPECT_RATIO`).

## Primeira publicação

```bash
npx wrangler d1 create meu-avatar          # copie o database_id para o wrangler.jsonc
npx wrangler r2 bucket create meu-avatar
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put OPENROUTER_WEBHOOK_SECRET   # o mesmo do painel do OpenRouter
npm run db:migrar < /dev/null
npm run deploy
```

Em seguida, abra o endereço e crie a conta do administrador. Confira se `SITE_URL` bate com o endereço que o deploy mostrar
(`https://meu-avatar.<subdomínio>.workers.dev`).

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
