# Backlog

O que falta fazer no meu.avatar, em ordem. Cada item vira um PR próprio, com a
sua migration quando precisar. Ao terminar um item, tire-o daqui (ou marque o
que ficou para depois) no mesmo PR.

## Ordem

1. **Testar outro modelo de vídeo com áudio próprio** (em andamento: HeyGen
   Avatar IV no ar para o administrador testar)
2. Voz gerada à parte e avatar falante (o HeyGen Avatar IV já faz isso numa
   chamada só; ver o item 1)
3. Convites do administrador
4. Esqueci a senha

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
  por modelo; na página do modelo, o formulário fica de um lado e os vídeos
  daquele modelo do outro. Cada vídeo guarda a estrutura que o gerou. Hoje: Wan 3.0 (para todos) e HeyGen Avatar
  IV (em teste, só o administrador).

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

## 2. Voz gerada à parte e avatar falante

Só se nenhum modelo do item 1 entregar voz limpa. Gerar a voz num modelo de
voz (TTS do OpenRouter, `/api/v1/audio/speech`) e animar a foto com um modelo
que sincroniza a boca com o áudio: `heygen/avatar-iv` no OpenRouter
(US$ 0,05/s; aceita `voice_id` e `voice_settings`) ou o Seedance com áudio de
referência. É o que o Higgsfield faz no explainer narrado (voz à parte, juntada
depois). Muda mais o fluxo: duas chamadas e duas esperas por vídeo.

## 3. Convites do administrador

Hoje o primeiro cadastro vira admin e o cadastro fecha. O admin precisa
convidar outras pessoas. Portar do estuda.mais (`src/auth.ts` e o painel
`src/admin/`): links de convite de uso único com validade (72 h), tabela
`invites`, página para criar a senha pelo link e remover acesso. A tabela
`users` já tem `role` (`admin`/`member`) e aceita `password_hash` nulo
(convite não aceito).

## 4. Esqueci a senha

No estuda.mais é o mesmo link de convite, gerado de novo pelo admin. Para o
próprio admin, hoje o caminho é apagar a conta no D1 e cadastrar de novo
(`docs/operacao.md`). Fazer junto com o item 3.

## Pendências pequenas

- **`www.meuavatar.ia.br`**: configurado na Cloudflare com certificado
  próprio, mas não deu para conferir do ambiente cloud (o proxy recusa).
  Conferir no navegador que redireciona para `https://meuavatar.ia.br`.
- **Token da Cloudflare**: sem as permissões de criar zona e de ler DNS.
  Só faz falta para diagnóstico.
- **"Na fila" sem "gerando"**: o OpenRouter não passa pelo status
  `in_progress` no Wan; o cartão mostra os minutos de espera (o 720p leva uns
  10 min) para não parecer travado.
