# Pack de Vídeos 3D Explicativos

Uma pasta que transforma o seu agente de IA (Claude Code, Codex ou qualquer outro que leia arquivos e rode comandos) em um **criador de vídeos 3D explicativos**: bonequinhos low-poly, cenário completo, roteiro que prende, narração, legendas e capa. Você só diz **a ideia** e **a duração**.

## Como usar (3 passos)

1. **Baixe e descompacte** esta pasta (precisa de [Node.js](https://nodejs.org) 18+, do [ffmpeg](https://ffmpeg.org) e de um navegador Chrome, Edge ou Brave).
2. **Abra o seu agente de IA** (de preferência um de código, como o Claude Code) e cole o prompt do arquivo **`PROMPT.md`** (preencha a pasta, a ideia, a duração e a voz).
3. Responda às perguntas da primeira vez (nome do canal, nicho, estilo, voz) e depois é só mandar: *"Quero um vídeo de 45 segundos sobre como um elevador funciona."*

O agente faz o resto: pesquisa, roteiro viral, narração, cenas 3D, legendas, vídeo final, capa e texto de postagem.

**Sempre animado de verdade:** o motor mostra o **processo** (pedra caindo, líquido jorrando, fumaça, água em canos, máquinas e fábricas funcionando, rastro de pavimento, peças girando) sobre um **cenário real** (campo, cidade, floresta, deserto, litoral, indústria ou sala), e o validador **recusa** cenas paradas e fundos de cor sólida. O guia `docs/processos.md` ensina o agente a animar qualquer tema.

**Visual:** céu em degradê, colinas, nuvens, sombra suave e correção de cor; legenda de uma palavra por vez; e, **só quando o vídeo exigir**, setas, ícones (X, V, alerta...), etiquetas com dados e efeito de preto e branco com zoom.

## Voz da narração (você escolhe)

| | Grátis | Paga |
|---|---|---|
| Ferramenta | Kokoro + Whisper (rodam no seu computador) | ElevenLabs |
| O que o agente faz | verifica o seu computador e, se rodar, **instala sozinho** (com a sua permissão) | você coloca a chave de API no arquivo `.env` |

## O que vem na pasta

| Pasta/arquivo | Para quê |
|---|---|
| `AGENTE.md` | o "prompt universal": transforma a IA em criador de vídeos (fluxo, regras, roteiro viral) |
| `assets/` | 11 personagens (mesmo esqueleto), 20 animações e 57 itens de cenário (casas, prédios, ruas, veículos, obras, máquinas animadas, formas livres, tubos...) |
| `engine/` + `tools/render.mjs` | o motor que desenha cada quadro e gera o MP4 |
| `tools/voz.mjs` | diagnóstico do computador, voz grátis/paga e tempo de cada palavra |
| `catalog/` | catálogo dos assets (para a IA usar como diretor) |
| `docs/` | storyboard, roteiro viral, voz e postagem |
| `projects/exemplo-casa/` e `projects/exemplo-asfalto/` | dois vídeos de exemplo completos (roteiro, narração, storyboard); o do asfalto (120 s) é o **padrão de qualidade** a seguir |
| `preview/` | páginas para **ver** os personagens, as animações e o cenário |

Ver os assets no navegador: `npm install`, `npm run preview` e abrir http://localhost:5173 (menu **Personagens | Cenário**).

## Comandos úteis

```bash
npm install                                     # primeira vez
npm run voz -- diagnostico                      # o seu computador roda a voz grátis?
npm run voz -- instalar                         # instala a voz grátis (~0,5–1 GB em .voz/)
npm run novo -- "Título do vídeo"               # cria a pasta de um vídeo
npm run validar -- projects/<nome>              # confere o storyboard
npm run render -- projects/<nome> --quadros     # imagens para conferir cena por cena
npm run render -- projects/<nome>               # vídeo final 1080×1920
npm run check                                   # testa o pack inteiro
npm run empacotar                               # gera dist/kit-video-3d.zip para compartilhar
```

## Como funciona por dentro

`ideia → sinopse (você aprova) → roteiro → voz + tempo por palavra → storyboard.json → validação → quadros → vídeo → capa + postagem`

O storyboard é um arquivo de dados (não código): lista cenas, personagens, ações, câmera e textos. O motor lê o arquivo e desenha qualquer instante do vídeo; tudo é função do tempo, então o render é exato e repetível. O formato está em `docs/storyboard.md`.

## Limites conhecidos

- Cenário e personagens são simples de propósito (estilo low-poly). Não há ainda estádio, metrô, elevador nem interior de casa; o agente compõe com o que existe e avisa.
- A naturalidade da voz grátis em português deve ser avaliada de ouvido; a paga tende a ser mais natural.
- O render usa o navegador do computador: em máquinas muito simples pode ser lento (um vídeo de 30 s leva de 1 a alguns minutos num computador comum).
- Confira as regras atuais da plataforma sobre monetização e conteúdo feito com IA antes de postar.

## Desinstalar

Apague a pasta `.voz/` para remover a voz grátis. Nada é instalado fora desta pasta.
