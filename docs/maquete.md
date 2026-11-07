# Maquete 3D

A maquete é uma cena de formas cinza montada em 3D, com a câmera posta por números, que vira a
foto de referência do `gerar_imagem`. Ela resolve o enquadramento que o prompt sozinho não acerta:
no teste de 06/11/2026 ([modelos/gemini-nano-banana-2.1.md](modelos/gemini-nano-banana-2.1.md)),
o Nano Banana errou o ângulo do canto do teto só com a descrição e acertou com a maquete. A
regra que saiu do teste é: **a maquete dá a disposição e a câmera; a descrição dá a decoração,
as cores e a luz; o que a descrição não citar sai vazio, como na maquete.**

A mesma base vai servir para a animação 3D direta (vídeos no estilo de bonecos e cenários, sem
modelo de IA). A ordem combinada, um PR por vez, está no [backlog](backlog.md).

## Como o agente usa

`montar_maquete {projeto, cena}` (MCP) ou `POST /api/v1/projetos/<id>/maquete` ([api.md](api.md)).
A cena é JSON, sem código: ambiente, objetos, pessoas e câmera. A resposta traz a foto (guardada
nos arquivos do projeto, com o `src` para o `referencia` do `gerar_imagem`) e o relatório: onde cada
pessoa e objeto caiu no quadro, em %, o que ficou cortado e para onde o rosto está virado. O agente
olha a foto e o relatório e monta de novo até o enquadramento ficar certo; não gasta créditos.

Na descrição do `gerar_imagem`, dizer que a referência é uma maquete cinza, que é para copiar a
câmera, o ângulo, a lente e as posições e virar foto real, e que o boneco vira a pessoa descrita.

## Onde fica

Tudo em `container/render/`, no contêiner de render (o mesmo das animações em HTML):

- `cena3d/corpo.js`: o manequim. Proporção humana real (mulher, homem e criança, altura e porte),
  tronco em três segmentos torneados que se encaixam nas juntas, mãos com cinco dedos de três
  falanges, cabelo (curto, longo, preso, careca). Juntas com nomes do corpo (`dobra`, `abre`,
  `gira`, `inclina`...) e limites; a mão vai a um ponto por cinemática inversa de dois ossos
  (`maoEm`), e a cabeça vira para um ponto (`olharPara`).
- Colisão dos braços (`corpo.js`, `soltarBracos`): o corpo vira cápsulas (tronco, cabeça, coxas,
  canelas, braço, antebraço e mão); o braço que entra em outra parte sai sozinho (a mão que foi a um
  ponto tem o ponto empurrado para fora; o braço solto abre um pouco). O que a cena fixou em `juntas`
  não mexe e vira aviso no relatório.
- Segurar objeto: com `na_mao` e uma posição (`posicao` ou `sobre`), o objeto fica onde a cena pôs e
  o braço vai até ele (cinemática inversa), com a palma virada para o objeto e o polegar para o
  topo; se não alcança, o relatório diz quanto faltou. Sem posição, o objeto acompanha a mão da pose.
  A palma encaixa pela superfície: fica paralela a ela e encostada, com o polegar para o topo (no
  objeto chato, como o celular, a palma deita nas costas, do lado oposto ao rosto, e os dedos seguem
  o antebraço, até 45° do comprimento). O punho dobra no máximo 35° (`MAX_PUNHO`); acima disso a mão
  encosta sem ficar paralela, e o relatório avisa quanto o punho precisaria e quantos graus a palma
  ficou fora do paralelo (acima de 10°). O objeto gira (`giro`) e tomba (`inclina`) para caber.
  A selfie olha para o que a mão direita segura (`olhar: "maoD"` na pose).
- `cena3d/poses.js`: poses prontas em camadas (uma do corpo e uma dos braços) e formatos de mão.
  Pose de braço pode levar a mão a um ponto preso a uma junta (mãos na cintura, no queixo).
- `cena3d/objetos.js`: móveis, casa e produtos feitos de formas em código (nenhum arquivo 3D).
  Cada um nasce com a base no chão e a frente para +Z; os que têm assento dizem onde sentar.
- `cena3d/cena.js`: valida o JSON (cada erro diz o campo e o que usar), monta a cena (objetos sobre
  outros, pessoa no chão sozinha ou no assento, objeto na mão, olhar), a câmera pela lente em mm e
  a luz, e faz o relatório.
- `maquete.mjs`: abre a página no Chrome com o WebGL de software (SwiftShader, sem GPU) e tira o
  PNG. A rota é `POST /maquete` no `servidor.mjs`.

Convenções: metros; chão em y = 0; a frente é +Z; a esquerda da pessoa (E) é +X. A lente é o
equivalente de 35 mm pela diagonal (o celular comum é 26 mm).

## Decisões

- **Código nosso, do zero.** O mannequin.js (GPL-3.0) e o kit de vídeo 3D da pasta `temp/` (sem
  licença) serviram só de ideia: juntas com nomes do corpo, poses como números, cena descrita em
  dados. Nada foi copiado ou traduzido.
- **Cena em JSON, não em código**: mais curta para o agente, mais difícil de errar e validada no
  servidor, com a lista do que corrigir.
- **Sem arquivo 3D no repositório** (regra do CLAUDE.md): tudo é forma em código. Modelo pronto,
  se um dia vier, fica no R2 ou é baixado na montagem da imagem, como as fontes.
- **Estilo neutro por padrão.** No teste de 06/11/2026 ([modelos/gemini-nano-banana-2.1.md](modelos/gemini-nano-banana-2.1.md)), a
  maquete em contraste (uma cor por categoria) às vezes fixou melhor a disposição, mas a cor de
  móvel que a descrição não citou passou para a foto. `estilo: "contraste"` fica como opção.
- O catálogo (poses, mãos, objetos) está repetido na descrição da ferramenta em `src/mcp.ts`; o
  `npm run teste:maquete` falha se as listas divergirem.

## Medidas

No computador (Chrome do Mac, SwiftShader): uns 2,5 s por foto de 720 × 1280 com duas pessoas e
uma sala.

## Ajustar as poses no visualizador

`npm run maquete` abre o visualizador ao vivo em http://localhost:8790 (`tools/maquete/`). Ele mostra
a cena de `tools/maquete/cena.json` com a biblioteca de verdade (`container/render/cena3d`) e
recarrega sozinho quando o código ou a cena mudam. Precisa do Three.js instalado em
`container/render` (`npm ci` lá dentro).

- Câmera: arrastar gira, a roda aproxima, as setas andam (Shift: mais rápido), "Câmera da cena"
  volta ao enquadramento.
- Painel à direita: pessoa, pose do corpo e dos braços, porte, altura, formato das mãos e cada junta
  num controle deslizante, com a cena mudando na hora. Amarelo é o que foi ajustado ali. "↶ Voltar"
  (ou Cmd+Z) desfaz um passo; "Esquerdo → direito" e "Direito → esquerdo" espelham braços e pernas;
  "Copiar braços para as outras (proporcional)" leva o ajuste dos braços de uma pessoa para as outras,
  com a mão no mesmo lugar proporcional ao corpo de cada uma (largura e profundidade do porte).
  Mexer no braço ou no cotovelo desliga, naquele lado, o ponto para onde a pose levava a mão.
- "Salvar ajustes" grava `tools/maquete/ajustes.json` (fora do git). O Claude lê e passa para a pose
  em `poses.js`. Quando a pessoa ajustou mais de um porte, a pose guarda um conjunto por porte em
  `porPorte` e interpola os do meio (é assim nos braços cruzados).

## Rodar no computador

O contêiner não roda sem Docker, mas o servidor dele roda no Node com o Chrome instalado:

1. `.claude/launch.json` tem a configuração `render-local` (`node container/render/servidor.mjs`
   com `CHROME` apontando para o Chrome e `PORT=8095`).
2. No `.dev.vars`, `RENDER_URL=http://localhost:8095` (só vale com `AMBIENTE=local`): o Worker do
   `wrangler dev` passa a usar esse servidor no lugar do contêiner.
3. `npm run teste:maquete` roda os testes da biblioteca no Node, sem navegador.

## Onde parou (06/11/2026)

Trabalho em andamento no branch `claude/maquete-3d`, ainda sem PR e sem publicar.

- Poses do corpo revisadas uma a uma com o dono no visualizador, nas três versões de porte (0,75, 1 e
  1,35). Braços: revisadas até `selfie`; faltam `segurando_na_frente`, `mostrando_produto`,
  `falando`, `celular`, `bracos_para_cima`, `segurando_caixa` e `maos_no_bolso`.
- Em aberto na pegada de objetos (`segurarObjeto`): com o celular em pé perto do rosto, o punho
  ainda passa dos limites (35° dobrando, 20° desviando) em algumas posições. O dono apontou que o
  celular estava longe demais do rosto; a cena do visualizador já o põe mais perto. Decidir se os
  limites seguem os da anatomia (60° e 30°).
- Depois: abrir o PR, publicar pela sessão na nuvem (a imagem do render muda: versão 5) e seguir o
  plano do backlog (biblioteca, animação direta, duas referências, telas).
