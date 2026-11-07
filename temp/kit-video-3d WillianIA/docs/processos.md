# Como mostrar o PROCESSO em animação (vale para qualquer tema)

O vídeo é **100% animado**. Nenhuma cena pode ser "um objeto parado + a câmera girando + o boneco falando". Para **qualquer** assunto (obra, cozinha, corpo humano, máquina, finanças, ciência, história), toda ideia explicada precisa **acontecer na tela**: algo entra, se move, se transforma, flui, gira, cresce, sai. O espectador deve **ver** o que a narração diz.

> **Regras de ouro**
> 1. **Nunca escreva código de renderização/animação próprio nem outro motor.** O motor do pack faz tudo; se faltar um objeto, **componha** com `forma`, `tubo`, `fluxos` e `anim` (abaixo).
> 2. **Sempre um cenário real ao fundo** (campo, cidade, floresta, deserto, litoral, indústria ou uma sala). Nunca cor sólida, nunca "diorama flutuando". O validador recusa.
> 3. **Cada cena tem pelo menos 2 tipos de animação** entre: `movimento`, `fluxo`, `transformação`, `máquina`, `ação` do personagem. Câmera e fala não contam como processo.
> 4. **Sempre alguém fazendo**: personagens executando a ação (cavar, martelar, empurrar, apontar, carregar) em mais da metade das cenas.
> 5. O visual é **colorido e alegre**, no estilo desenho (céu azul, nuvens, árvores, casas). Nada técnico, escuro ou "de laboratório".

## 1. Plano de animação (obrigatório, antes do storyboard)

Crie `projects/<nome>/plano-animacao.md` com **uma linha por frase** da narração (use `frases.json`):

| Frase | A ideia vira... | O que se MOVE | O que FLUI | O que se TRANSFORMA | Quem FAZ | Cenário e plano |
|---|---|---|---|---|---|---|
| "Então você espalha pedra britada..." | caminhão despeja brita | caminhão recua e levanta a caçamba | brita cai da caçamba no chão | o monte cresce | servente espalha com a pá | obra, plano geral → close |

Se uma linha tiver as colunas vazias, **invente a ação**: toda frase tem um jeito de ser mostrada. Cada **substantivo e verbo** da frase é uma oportunidade de animação (o que é? de onde vem? para onde vai? o que acontece depois?).

## 2. Vocabulário visual: o que você quer mostrar → qual recurso usar

| Quero mostrar... | Use |
|---|---|
| Matéria caindo/fluindo (pedra, areia, terra, concreto, grão) | `fluxos` com `material` e `origem`→`destino` |
| Líquido sendo espirrado/despejado (asfalto, água, tinta) | `fluxos` (`asfalto`, `agua`) com `jato` |
| Algo passando dentro de um cano, fio ou veia | `tubo` (com `opacidade: 0.4`) + `fluxos` com `caminho` igual aos pontos do tubo |
| Calor, fogo, fumaça, vapor, faíscas, poeira | `fluxos` (`fogo`, `fumaca`, `vapor`, `fagulha`, `poeira`) |
| Ar, bolhas, neve, eletricidade, luz | `fluxos` (`ar`, `bolha`, `neve`, `eletricidade`, `luz`) |
| Máquina trabalhando | `escavadeira`, `esteira`, `misturador`, `engrenagem`, `helice`, `fabrica_processo`, `betoneira`, `rolo_compressor`, `vibroacabadora`, `espargidor`, `caminhao_cacamba` |
| Algo sendo construído/acumulado | `etapa` (casa_obra, predio_estrutura, rua_camadas...), `monte` crescendo, `rastro` atrás de uma máquina |
| Reservatório enchendo/esvaziando | `tanque` com `etapa` (nível) |
| Ver por dentro | `opacidade`, `tanque`, `rua_camadas`, `corte_terreno` |
| Uma peça girando/balançando/subindo | `anim` (`gira`, `oscila`, `pos`, `escala`, `pulsa`) em qualquer objeto |
| Algo aparecendo/sumindo | `aparece` / `some` |
| Qualquer objeto que não existe no catálogo | `forma` (caixa, cilindro, esfera, cone, toro, cápsula) empilhadas, com cor/`brilho`/`emissivo` |
| Certo × errado, antes × depois | dois objetos lado a lado + ícones `x`/`v` + `pretoebranco` no ruim |
| Pessoas fazendo | personagens com `acoes` (`dig`, `hammer`, `push`, `carry`, `point`, `crouch`...) e `movimentos` |

### Qual fundo usar (`ambiente.fundo`)

| Tema | `fundo` (e `chao` padrão) |
|---|---|
| rua, casa, obra urbana, trânsito, comércio | `cidade` (concreto) ou `campo` (grama) |
| natureza, agricultura, terraplenagem, rodovia | `campo` (grama) ou `floresta` |
| cozinha, banheiro, geladeira, laboratório, eletrodoméstico | `interior` (madeira) |
| fábrica, usina, mineração, siderurgia | `industrial` (concreto) |
| praia, porto, mar, navio | `litoral` (areia) |
| deserto, pirâmides, história antiga | `deserto` (areia) |

Dica: dentro de uma **sala** (`interior`) ou fábrica, o objeto principal costuma ficar no centro com `anim` e `fluxos`.

## 3. Receitas (copie e adapte; coordenadas em metros)

**Caminhão despejando pedra e o monte crescendo**
```json
"objetos": [
  { "id": "cam", "asset": "caminhao_cacamba", "pos": [0,0,0], "giro": 90, "etapa": [[27,0],[29.6,1]] },
  { "id": "monte", "asset": "monte", "params": { "material": "pedra" }, "pos": [-5.5,0,0], "etapa": [[27.5,0.05],[31,1]] }
],
"fluxos": [{ "material": "pedra", "origem": { "ancora": "cam", "desloca": [0,1.6,-4.6] }, "destino": { "ancora": "monte", "desloca": [0,1.2,0] }, "taxa": 45, "de": 28, "ate": 30.5 }]
```

**Espargidor espirrando líquido preto (e deixando a faixa molhada)**
```json
"objetos": [{ "id": "esp", "asset": "espargidor", "pos": [0,0,-14], "movimentos": [{ "de": 47, "ate": 51, "para": [0,10] }] }],
"fluxos": [{ "material": "asfalto", "origem": { "ancora": "esp", "desloca": [0,0.6,-5.1] }, "destino": { "ancora": "esp", "desloca": [0,0.02,-6.5] }, "taxa": 60, "dispersao": 1.3, "de": 47, "ate": 51 }],
"rastros": [{ "seguir": "esp", "largura": 2.9, "cor": "#15161a", "recuo": 6, "de": 47, "ate": 51 }]
```

**Vibroacabadora pavimentando (faixa nova crescendo + vapor)**
```json
"objetos": [
  { "id": "pav", "asset": "vibroacabadora", "pos": [0,0,-8], "movimentos": [{ "de": 78, "ate": 84, "para": [0,6] }] },
  { "id": "cam", "asset": "caminhao_cacamba", "pos": [0,0,0.2], "movimentos": [{ "de": 78, "ate": 84, "para": [0,14.2] }] }
],
"rastros": [{ "seguir": "pav", "largura": 3.2, "altura": 0.07, "cor": "#222226", "recuo": 2.6 }],
"fluxos": [
  { "material": "vapor", "origem": { "ancora": "pav", "desloca": [0,0.2,-3.2] }, "taxa": 14 },
  { "material": "asfalto", "origem": { "ancora": "cam", "desloca": [0,1.8,-5.2] }, "destino": { "ancora": "pav", "desloca": [0,1.3,2.4] }, "taxa": 35 }
]
```

**Água correndo por um cano até a torneira**
```json
"objetos": [
  { "id": "cano", "asset": "tubo", "pos": [0,0,0], "opacidade": 0.4, "params": { "pontos": [[0,5,0],[0,1.2,0],[4,1.2,0],[4,1.2,2]], "raio": 0.18, "cor": "#3d8ee0" } }
],
"fluxos": [{ "material": "agua", "caminho": [[0,5,0],[0,1.2,0],[4,1.2,0],[4,1.2,2]], "taxa": 30, "velocidade": 3 }]
```

**Engrenagens se movendo juntas** (duas `engrenagem`, uma com `velocidade` negativa e `fase` diferente) · **Peça subindo e descendo** (`"anim": { "oscila": { "eixo": "y", "amp": 0.6, "freq": 0.5 } }`) · **Chama aquecendo** (`fluxos` `fogo` + `fumaca` na origem da panela/caldeira).

**Escavadeira cavando e o monte de terra aumentando:** `escavadeira` (cava sozinha em ciclo; despeja à direita, +X) + `monte` (`material: terra`) à direita com `etapa` crescente + `fluxos` `poeira` na caçamba.

**Fábrica/usina:** `fabrica_processo` (esteiras, tambor com chama, chaminé com fumaça e bica de carga, tudo animado) com um caminhão em [9.5, 0, 3.6]. Câmera em planos diferentes: geral, close na esteira, close na chaminé.

## 4. Ritmo visual por cena (3–5 s)

1. **Entra** (aparece, chega, cai) → 2. **acontece** (processo com fluxo/máquina/ação) → 3. **resultado** (etapa concluída, etiqueta com o nome do termo novo). Troque o ângulo a cada corte: plano geral para situar, **close no detalhe do processo**, vista em corte/transparente para o "por dentro".

## 5. Verificação

`node tools/validar.mjs projects/<nome>` calcula a densidade de animação de cada cena e **bloqueia** cenas paradas e fundos inválidos. Depois olhe os quadros (`--quadros`): se uma cena "parece uma foto", ela está errada: acrescente fluxo, movimento ou ação.
