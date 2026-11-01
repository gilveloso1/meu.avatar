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
| `GET /api/v1/projetos/<id>/quadros?src=&instantes=1,3.5` | JPG com os instantes lado a lado (até 12), para ver o vídeo |
| `GET /api/v1/projetos/<id>/silencios?src=` | Duração e silêncios do arquivo, com a regra da Edição rápida |
| `POST /projetos/<id>/arquivos` | Envia um arquivo (a mesma rota do canvas) |
| `POST /projetos/<id>/exportar` `{final, versoes?}` | Começa a exportação |
| `POST /projetos/<id>/exportacoes/<e>` | Faz o próximo passo; sem isso, o agendamento termina |
| `GET /projetos/<id>/exportacoes/<e>` | Estado e endereços para baixar |

Erro: `{"erro": "<código>"}`, com `comando` (a posição no lote) quando um comando é
recusado. Em 409, `revisao` traz a atual: leia o projeto e refaça o lote.

## Comandos

| `tipo` | Campos | Efeito |
|---|---|---|
| `adicionar` | `video` ou `arquivo`; `nome`, `inicio`, `fim`, `semSom`; `dur` (obrigatório em vídeo e áudio de `arquivo`); `depois` ou `sobre` e `em` | Bloco novo. `depois`: entra logo depois daquele bloco e empurra o resto. `sobre`: cobre o grupo a `em` segundos (ou soma o som, se for áudio). Sem os dois: linha nova, solta |
| `cortar` | `bloco`, `inicio`, `fim` | Trecho do arquivo, em segundos; a sequência fica encostada |
| `dividir` | `bloco`, `em` | Dois blocos, no instante `em` do arquivo; 0,5 s no mínimo de cada lado |
| `mover` | `bloco`, `depois` ou `antes` | Muda a ordem, sem buraco; a cobertura e o som somado vão junto |
| `velocidade` | `bloco`, `velocidade` (0,25 a 4) | Mantém o tom da voz; o resto da sequência acompanha |
| `removerPausas` | `bloco` (sem ele, todos), `pausa` (`curta`, `media`, `longa`) | Tira as pausas com a regra da Edição rápida |
| `enquadrar` | `bloco`; `zoom` (1 a 8), `focoX`, `focoY` (0 a 1) ou `rosto: true`; `chaves: [{t, zoom, focoX, focoY}]`; `encaixe` (`preencher`, `caber`, `desfocar`); `recorte: {esquerda, topo, direita, base}`; `espelharH`, `espelharV`, `girar` (0, 90, 180, 270); `limpar` | Só muda o que vier. `t` é o tempo do bloco; entre as chaves, a curva é suave |
| `ligar` | `de`, `para` | Liga blocos (ou um Final); recusa círculo, repetida e passar de 48 variações |
| `remover` | `ids`, `fechar` | Blocos, Finais ou linhas; com `fechar`, a sequência encosta |
| `som` | `bloco`, `volume` (0 a 4), `mudo` | Volume do bloco |
| `final` | `id`, `resolucao`, `formato`, `velocidade` | Muda um Final; sem `id`, cria outro. A velocidade vale para todas as variações dele |
| `organizar` | | O mesmo Organizar da tela |

O primeiro bloco de um projeto vazio traz o Final `final`, já ligado a ele, como na tela.
A resposta traz `criados`, com os ids novos na ordem dos comandos.

## Limites de agora

- Não há edição por palavra: falta a transcrição com tempos.
- Só entram vídeos gerados e arquivos do projeto; os ativos de avatar ainda não
  (`Exports.source`).
- Sem limite de uso por conta: exportar custa contêiner, e isso precisa de regra antes
  de abrir a outras contas.
- Velocidade e enquadramento ainda não têm campos nos Ajustes: só pela API, e a prévia mostra.
- O fundo desfocado da prévia não acompanha o zoom; o da exportação, sim.
