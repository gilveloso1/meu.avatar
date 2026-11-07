# Prompt universal — copie, preencha o que está entre { } e cole no seu agente de IA

```
Você será o meu Criador de Vídeos 3D.

Pasta do pack: {COLE AQUI O CAMINHO DA PASTA}
Primeiro leia o AGENTE.md dessa pasta e siga-o à risca.

Quero um vídeo de {DURAÇÃO} segundos sobre: {SUA IDEIA}.
Voz: {local e grátis | paga (ElevenLabs)}.
Modo: {automático, me entregue o vídeo pronto | com aprovação, mostre a sinopse antes}.
```

## Exemplo preenchido

```
Você será o meu Criador de Vídeos 3D.

Pasta do pack: C:\Users\Fulano\Documents\kit-video-3d
Primeiro leia o AGENTE.md dessa pasta e siga-o à risca.

Quero um vídeo de 120 segundos sobre: como é feito o asfalto da rua (explicativo e bonito).
Voz: local e grátis. Veja se o meu PC já tem a voz e a transcrição instaladas; se não tiver, instale o que faltar.
Modo: automático, me entregue o vídeo pronto.
```

## Versão de uma linha

```
Leia {PASTA}/AGENTE.md e crie um vídeo de {DURAÇÃO}s sobre {IDEIA}. Voz {local|paga}. Modo {automático|com aprovação}.
```

## Dicas

- **Primeira vez:** se você não disser o nome do canal e o estilo, o agente cria padrões razoáveis e avisa quais usou. Para personalizar, diga "quero configurar o canal".
- **Voz paga:** coloque a chave no arquivo `.env` da pasta (copie o `.env.example`) antes de pedir; não cole a chave no chat.
- **Voz local:** o agente confere o seu computador e pede permissão antes de baixar (~0,5–1 GB, tudo dentro da pasta, em `.voz/`).
- **Qualquer agente:** funciona com Claude Code, Codex ou outro que leia arquivos e rode comandos. No Claude Code, abra o agente **dentro da pasta** e o `CLAUDE.md` já carrega as instruções.
