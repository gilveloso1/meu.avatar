# Voz da narração: grátis ou paga

O criador escolhe **uma vez** (e pode trocar quando quiser). Tudo passa por `node tools/voz.mjs`.

| | Voz grátis | Voz paga |
|---|---|---|
| Ferramenta | **Kokoro** (voz) + **Whisper** (tempo de cada palavra) | **ElevenLabs** |
| Custo | R$ 0 (roda no computador) | plano mensal do ElevenLabs |
| Precisa de | Python 3.9–3.12, ffmpeg, ~2–3 GB livres, 4 GB de RAM (8 GB recomendado) | chave de API |
| Qualidade em português | boa, voz de preset (feminina `pf_dora`; masculinas `pm_alex`, `pm_santa`) | a mais natural; muitas vozes e estilos |
| Velocidade | mais rápido que o tempo real em computador comum | segundos |
| Observação | não clona voz; a naturalidade deve ser avaliada de ouvido | consome créditos por caractere |

## Caminho A — voz paga (ElevenLabs)

1. O criador abre o ElevenLabs, cria uma **chave de API** e copia o arquivo `.env.example` para `.env`, colando a chave depois de `ELEVENLABS_API_KEY=`. **Prefira que ele mesmo edite o arquivo `.env`** em vez de colar a chave no chat. A chave nunca deve ser mostrada, repetida nem gravada em outro lugar.
2. `node tools/voz.mjs vozes` lista as vozes da conta. Mostre algumas (nome + idioma) e peça para ele escolher.
3. `node tools/voz.mjs configurar-paga --voz <id>`
4. `node tools/voz.mjs testar` gera uma frase de teste em `projects/_teste-voz/` para ele ouvir.

O áudio já vem com o tempo de cada palavra; o Whisper não é usado.

## Caminho B — voz grátis (Kokoro + Whisper)

1. `node tools/voz.mjs diagnostico`: confere processador, memória, disco, Python, ffmpeg e navegador e diz se o computador roda. Leia o resultado ao criador em linguagem simples.
2. Se o veredito for `nao`, explique o motivo e ofereça a voz paga.
3. Se faltar Python/ffmpeg, diga como instalar (e só instale com a permissão dele).
4. **Peça permissão antes de instalar**: serão baixados cerca de 0,5 a 1 GB (modelo da voz, vozes e modelo do Whisper), sempre em `.voz/` dentro do pack. Para desinstalar basta apagar essa pasta.
5. `node tools/voz.mjs instalar` (faz tudo sozinho e termina com um teste de voz e de tempos).
6. `node tools/voz.mjs testar` e peça para ele ouvir `projects/_teste-voz/narracao.wav`. Se não gostar, teste outra voz: `node tools/voz.mjs gerar projects/_teste-voz --voz pm_alex`.

A configuração escolhida (modelo completo ou leve, tamanho do Whisper) depende da máquina: o diagnóstico decide.

## Gerar a narração de um vídeo

```bash
node tools/voz.mjs gerar projects/<nome> [--voz ID] [--velocidade 1.0]
```

Lê `projects/<nome>/narracao.txt` e escreve na mesma pasta:

| Arquivo | Conteúdo |
|---|---|
| `narracao.falado.txt` | o texto exatamente como foi falado (números por extenso, símbolos removidos) |
| `narracao.wav` / `narracao.mp3` | o áudio (Kokoro = wav, ElevenLabs = mp3) |
| `palavras.json` | cada palavra com `inicio` e `fim` (alimenta as legendas e a boca) |
| `frases.json` | cada frase com início e fim (use para alinhar as cenas) |
| `voz.json` | provedor, voz, duração |

Depois ajuste `duracao` e `audio` no storyboard. Se o ritmo ficou lento ou rápido, repita com `--velocidade 0.95` ou `1.05`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "Python não encontrado" | Instalar o Python 3.11 (python.org, marcando "Add to PATH") e rodar `instalar` de novo |
| Download falhou no meio | rodar `instalar` de novo (continua de onde parou) |
| Legenda adiantada/atrasada em algumas palavras | números e nomes difíceis; escreva por extenso/como se fala e gere de novo |
| ElevenLabs 401 | chave errada no `.env` |
| ElevenLabs 402 | créditos acabaram |
| Voz robótica no Kokoro | ajuste `--velocidade` ou pontuação; ou use a voz paga |
