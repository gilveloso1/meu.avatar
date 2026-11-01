# Ação na Bolsa: o caso real aprovado

Edição do projeto "Ação na Bolsa" aprovada pelo dono em 01/11/2026 (versão 7, 40,3 s). É a
referência do que um agente deve conseguir fazer sozinho. O vídeo não fica aqui, e o projeto
em produção não foi alterado. Os scripts rodaram numa pasta temporária: os caminhos deles
são de lá, e as fontes e o `gsap.min.js` não vêm junto.

- `projeto.json`: o canvas final, com os blocos, o enquadramento e a velocidade.
- `motion/`: o motion graphics que cobre a roupa errada, 11,9 s, opaco.
- `camada/`: gráficos e legenda sobre o vídeo, em WebM transparente, gerada por `gerar.py`.
- `palavras.json`: a fala com o tempo de cada palavra (Whisper, modelo small).
- `trilha.py`: a trilha sintetizada, só para teste. Abaixa onde há voz.
- `montar7.mts`: aplica os comandos e monta com o `container/exportar.py`.

## O que o dono pediu e vale para as próximas edições

- A legenda sai onde já há texto na tela, tem no máximo duas linhas e fica numa coluna
  central de 420 px (em 720 de largura), Inter Black de 44 px.
- Zoom de um mesmo trecho é um movimento só: nada de mudar o foco no meio da frase.
- Trilha baixa: volume 0,13, abaixando 9 dB na voz. Chimbal bem discreto.
- Conferir os quadros do vídeo de origem: havia uma pessoa passando na borda de um deles.
- Grafia da tela vem do português correto, não do texto enviado ao avatar ("Brasil", não "Bra-Zil").
