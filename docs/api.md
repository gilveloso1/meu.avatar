# API dos projetos

Para um agente editar um projeto do canvas com o mesmo modelo da tela, sem navegador. Só o
administrador, como o canvas; cada projeto é só de quem o criou. O código está em
`src/api.ts` e `src/comandos.ts`. O servidor MCP e a transcrição vêm depois, por cima disto.

## Decisões

- **Comandos, não JSON do canvas.** O agente diz o que quer, e as regras são as da tela
  (`src/canvas/modelo.js`). Um lote vale inteiro ou não vale nada.
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

## Criar um token

```bash
npm run token -- --email pessoa@exemplo.com --nome "Claude"
```

Sem `--remoto`, grava no banco local; com ele, em produção. O código aparece uma vez só.
Para revogar: `DELETE FROM api_tokens WHERE name = '...'`.

## Rotas

| Rota | O que faz |
|---|---|
| `GET /api/v1/videos?q=` | Vídeos prontos que a conta pode usar |
| `GET /api/v1/projetos?q=` | Projetos da conta |
| `POST /api/v1/projetos` `{nome}` | Cria um projeto |
| `GET /api/v1/projetos/<id>` | Revisão, grupos, Finais com as variações, arquivos e o canvas |
| `POST /api/v1/projetos/<id>/comandos` `{revisao, comandos}` | Aplica um lote (até 100) |
| `POST /projetos/<id>/arquivos` | Envia um arquivo (a mesma rota do canvas) |
| `POST /projetos/<id>/exportar` `{final, versoes?}` | Começa a exportação |
| `POST /projetos/<id>/exportacoes/<e>` | Faz o próximo passo; sem isso, o agendamento termina |
| `GET /projetos/<id>/exportacoes/<e>` | Estado e endereços para baixar |

Erro: `{"erro": "<código>"}`, com `comando` (a posição no lote) quando um comando é
recusado. Em 409, `revisao` traz a atual: leia o projeto e refaça o lote.

## Comandos

| `tipo` | Campos | Efeito |
|---|---|---|
| `adicionar` | `video` ou `arquivo`; `nome`, `inicio`, `fim`, `semSom`; `dur` (obrigatório em vídeo e áudio de `arquivo`); `depois` ou `sobre` e `em` | Bloco novo. `depois`: encosta no fim daquele bloco. `sobre`: cobre o grupo a `em` segundos (ou soma o som, se for áudio). Sem os dois: linha nova, solta |
| `cortar` | `bloco`, `inicio`, `fim` | Trecho do arquivo, em segundos |
| `ligar` | `de`, `para` | Liga blocos (ou um Final); recusa círculo, repetida e passar de 48 variações |
| `remover` | `ids` | Blocos, Finais ou linhas |
| `som` | `bloco`, `volume` (0 a 4), `mudo` | Volume do bloco |
| `final` | `id`, `resolucao`, `formato` | Muda um Final; sem `id`, cria outro |
| `organizar` | | O mesmo Organizar da tela |

O primeiro bloco de um projeto vazio traz o Final `final`, já ligado a ele, como na tela.
A resposta traz `criados`, com os ids novos na ordem dos comandos.

## Limites de agora

- Não há edição por palavra: falta a transcrição com tempos.
- Só entram vídeos gerados e arquivos do projeto; os ativos de avatar ainda não
  (`Exports.source`).
- Sem limite de uso por conta: exportar custa contêiner, e isso precisa de regra antes
  de abrir a outras contas.
- Em `depois`, inserir no meio de uma sequência é recusado (`posicao_ocupada`).
