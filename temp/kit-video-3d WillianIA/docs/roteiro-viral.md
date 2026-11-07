# Como escrever um roteiro que prende (e faz comentar)

Princípio central: **cada frase tem que dar um motivo para ouvir a próxima.** O vídeo é uma cadeia de promessas pagas: abre uma curiosidade, entrega a resposta, e a resposta abre a curiosidade seguinte. No final entrega tudo que prometeu e devolve uma pergunta ao espectador.

## Estrutura (adapte ao tempo pedido)

| Parte | Quando | O que faz |
|---|---|---|
| **Gancho** | 0 a 3 s (primeira ou duas primeiras frases) | Uma afirmação provocativa, uma pergunta intrigante ou uma promessa concreta. O espectador decide ficar ou sair aqui. |
| **Aposta** | 3 a 8 s | Diz o que a pessoa vai descobrir/fazer e por que importa **para ela**. |
| **Cadeia de capítulos** | meio | Cada capítulo = um **problema** → uma **solução** → um **novo problema**. Ex.: "mas o bloco afunda na areia… então você…". |
| **Reviravolta ou dado surpreendente** | perto de 2/3 | Um fato que quebra uma crença comum (o "nem era isso que você pensava"). |
| **Fechamento** | últimos 5 a 8 s | Resume em uma frase, **paga o gancho** e termina com a pergunta para comentar. |

### Tempos de referência

A voz fala cerca de **2,6 palavras por segundo** (confirme depois de gerar o áudio).

| Vídeo | Palavras | Capítulos | Cenas (3–5 s cada) |
|---|---|---|---|
| 30 s | ~75 | 3 | 7–9 |
| 45 s | ~115 | 4 | 10–13 |
| 60 s | ~155 | 5 | 13–18 |
| 90 s | ~235 | 6–7 | 20–27 |
| 3 min | ~470 | 10–12 | 40–55 |

## Gancho: fórmulas que funcionam (escolha uma e adapte ao tema)

- **Crença contrariada:** "Quase todo mundo erra isso sobre {tema}."
- **Pergunta com tensão:** "Por que {coisa comum} não {consequência óbvia}?"
- **Você como protagonista:** "Para descobrir {mistério}, você vai {fazer/construir}…"
- **Número surpreendente:** "{Coisa pequena} pesa/custa/dura {número absurdo}."
- **Polêmica honesta:** uma discordância real entre especialistas ou entre o que se ensina e o que os dados mostram. Apresente os dois lados com neutralidade.

Regras do gancho: **nada de "oi pessoal", nome do canal, "neste vídeo vamos ver"**. O título ou a pergunta já aparece escrito na tela no instante 0. **O gancho tem que ser verdadeiro e ser respondido no vídeo**: promessa não cumprida derruba a retenção e a confiança.

## Segunda pessoa e problema → solução

Fale **com** a pessoa: "você corta o bloco", "você puxa o trenó". Isso transforma explicação em experiência. Monte a cadeia de causas: cada etapa só existe porque a anterior criou um problema. Use conectores de curiosidade: "Mas aí vem o problema…", "Só que…", "E é aqui que…", "Então você…".

## Ritmo e retenção

- Frases curtas: **no máximo ~15 palavras**, uma ideia por frase. Fale como se contasse a um amigo.
- A cada **8–12 s**, um novo gancho interno: uma pergunta, um número, "e o mais estranho é…". Isso renova a atenção.
- Detalhe específico vale mais que adjetivo: nomes, números, "um estudo mostrou", "há 4 mil anos".
- Perguntas diretas ao espectador no meio ("Você sabe o que segura essa parede?") aumentam a atenção e geram comentário.
- Nada de enrolação: cada frase ou informa ou aumenta a tensão.
- Termine capítulos com um "gancho de ponte" para o próximo.

## Fechamento que gera comentário

1. **Pague o gancho** em uma frase clara.
2. Faça **uma pergunta específica e fácil de responder** (de preferência com opções: "foi A ou B?", "qual você achava?", "você já viu isso na sua cidade?"). Perguntas abertas demais ("o que você acha?") rendem pouco.
3. Convide a comentar ("Conta aqui nos comentários").
4. Se houver vídeo relacionado ou parte 2, peça para ver ("o vídeo relacionado aqui embaixo").
5. Se possível, **feche em loop**: a última frase retoma a primeira, para o replay parecer natural.

A mesma pergunta vai (1) no painel `pergunta` da última cena, (2) falada na narração e (3) no comentário fixado (ver `docs/postagem.md`).

## Honestidade e segurança do conteúdo

- **Fatos:** pesquise antes de escrever; use só o que você consegue sustentar. Marque o que é controverso ("os arqueólogos ainda discutem") em vez de afirmar. Anote as fontes em `projects/<nome>/fontes.md`.
- **Polêmica sem mentira:** provoque com ângulos reais, nunca com informação falsa nem acusações a pessoas ou grupos.
- **Sem conselhos médicos, financeiros ou legais** apresentados como certeza.
- **Sem músicas, trechos de livros ou falas protegidas por direitos autorais.** Texto sempre original.
- **Plataformas:** confira as regras atuais de monetização e de conteúdo gerado por IA da plataforma onde vai postar (originalidade, conteúdo repetitivo, divulgação de conteúdo sintético). Não presuma; peça ao criador para ler a política vigente.

## Escrevendo para ser falado (TTS)

- Escreva **numerais por extenso** quando possível ("vinte mil", não "20.000"); o normalizador cobre o resto, mas o texto por extenso soa melhor.
- Sem símbolos, siglas difíceis, parênteses, travessões ou emojis.
- Pontuação decide a pausa: ponto = pausa maior; vírgula = pausa curta. Use pontos de interrogação nas perguntas.
- Nomes difíceis: escreva como se fala ("Merer" pode virar "Mêrer"); teste de ouvido depois de gerar.
- O arquivo `narracao.txt` contém **só o que será falado**: sem títulos, marcações de cena, nem "NARRADOR:".

## Checklist antes de aprovar o roteiro

- [ ] O gancho está nas primeiras 15 palavras e tem tensão ou curiosidade.
- [ ] Ele é verdadeiro e é respondido antes do fim.
- [ ] Todo capítulo nasce de um problema do anterior.
- [ ] Há ao menos 2 perguntas ou "ganchos internos" no meio.
- [ ] O fato mais surpreendente está depois da metade.
- [ ] O final paga o gancho e termina com **uma** pergunta fácil de responder.
- [ ] Frases curtas, texto falado, sem símbolos.
- [ ] Tamanho: palavras ≈ duração × 2,6.
