# Resumo do catálogo

> Leia este arquivo primeiro (é curto). Detalhes de parâmetros, alturas de piso e exemplos: `CATALOG.md`. Gerado por `npm run catalog`.
> Convenções: metros; `giro: 0` olha para +Z; adulto = 1.72 m; asfalto y=0.06, calçada y=0.20.

## Motor: o que o storyboard sabe fazer (detalhes em docs/storyboard.md e docs/processos.md)
- **Fundos reais (sempre um):** campo, cidade, floresta, deserto, litoral, industrial, interior. Chão: grama, terra, areia, concreto, asfalto, madeira, piso. Clima: limpo, chuva. Horário: dia, tarde, nublado.
- **fluxos** (partículas do processo), materiais: pedra, brita, areia, terra, concreto, asfalto, agua, fumaca, vapor, poeira, ar, bolha, neve, eletricidade, luz, fagulha, fogo. Origem/destino por ponto ou `ancora`; `caminho` para canos/fios.
- **rastros** (faixa atrás de máquina), **anim** (pos/giro/gira/escala/oscila/pulsa), **opacidade**, **etapa**, **aparece/some**, **movimentos**, **viraPara**.
- **elementos** (seta, icone, etiqueta), **efeitos** (pretoebranco, zoom, tremor) e **textos** (titulo, destaque, pergunta).

## Personagens (`preset`)
- `construtor` (1.72 m): Protagonista / narrador
- `engenheiro` (1.75 m): Especialista técnico
- `engenheira` (1.65 m): Especialista técnica / supervisora de obra
- `servente` (1.72 m): Ajudante de obra
- `homem` (1.72 m): Morador / pessoa comum (dono da casa, passante, curioso fazendo a pergunta do vídeo)
- `mulher` (1.63 m): Moradora / pessoa comum (vizinha, mãe, passageira)
- `velhinho` (1.62 m): Idoso curioso ou sábio
- `velhinha` (1.55 m): Idosa curiosa ou sábia
- `crianca` (1.1 m): Criança curiosa (menino)
- `menina` (1.07 m): Criança curiosa (menina)
- `motorista` (1.72 m): Motorista (carro, ônibus, caminhão, metrô)
Opções em `overrides`: skin, height, build, headScale, top{color,stripe,sleeves}, bottom{color,type}, shoes, hair{style,color}, hat{type,color}, face{glasses,mustache,beard}, held{R,L}, stoop.
Cabelos: bald, short, fringe, long, ponytail, bun, curly, sides. Chapéus: none, hardhat, cap. Itens: none, hammer, clipboard, shovel.

## Animações (`clip` e `params`)
- `idle` (loop, torso/head/arms/legs): Em pé parado, respirando e balançando de leve
- `walk` (loop, torso/head/arms/legs): Andar em linha reta [desloca 0.943 m/s]
- `run` (loop, torso/head/arms/legs): Correr [desloca 2.781 m/s]
- `wave` (loop, armR/head/face) params: side="R": Acenar com a mão (cumprimento)
- `point` (segura a pose, armR/head) params: side="R", dir="forward": Apontar com o braço para mostrar algo
- `talk` (loop, armR/armL/head/face/torso) params: mouthOpen=null, energy=1: Falar gesticulando: mão direita e esquerda acompanham a fala, cabeça mexe, boca abre e fecha
- `hammer` (loop, armR/armL/torso/head/legs) params: side="R": Martelar (bater prego, construir)
- `carry` (loop, torso/head/arms/legs) params: walking=1: Carregar uma caixa/saco com os dois braços à frente [desloca 0.943 m/s]
- `push` (loop, torso/head/arms/legs): Empurrar algo pesado à frente (carrinho de mão, parede, porta), inclinado e com passos curtos [desloca 0.597 m/s]
- `dig` (loop, torso/head/arms/legs): Cavar com a pá (use o item "shovel")
- `cheer` (loop, torso/head/arms/legs/face): Comemorar pulando com os braços para cima (sucesso, "funcionou!", final do vídeo)
- `surprised` (segura a pose, torso/head/arms/face): Susto/surpresa: recua o corpo, abre os braços, olhos e boca arregalados
- `think` (loop, torso/head/arms/face): Pensar: mão no queixo, cabeça inclinada, olhando para cima
- `look_around` (loop, head/torso/face): Olhar ao redor, virando a cabeça e o corpo devagar para os lados
- `nod` (segura a pose, head/face): Balançar a cabeça dizendo "sim"
- `shake_head` (segura a pose, head/face): Balançar a cabeça dizendo "não"
- `shrug` (segura a pose, arms/head/torso/face): Dar de ombros ("não sei" / "talvez"): braços abertos e cabeça inclinada
- `crouch` (segura a pose, torso/head/arms/legs): Agachar para olhar/mexer em algo no chão (inspecionar fundação, fiação, encanamento)
- `sit` (segura a pose, torso/head/arms/legs) params: seatHeight=0.34, arms="lap": Sentar (cadeira, banco, banco do carro)
- `read_clipboard` (loop, arms/head/torso/face): Ler/anotar na prancheta (use com engenheiro, que já tem prancheta na mão esquerda)
Expressões: neutral, happy, laugh, sad, angry, surprised, worried, thinking, sleepy. Máscaras: torso, head, face, armL, armR, arms, legs, legL, legR.

## Cenário (`asset`, `variante`, `params`)
### Casas
- `casa_simples` 6.8×8.3×5.2 m variantes: verde, azul, amarela | params: wall="#f2e2bf", roof="#d2693a", door="#7a4a2b", trim="#ffffff", chimney=true: Casa térrea de telhado de duas águas, porta central, duas janelas na frente e chaminé
- `casa_colonial` 10×9.8×5.3 m variantes: rosa, azul | params: wall="#f6edd2", roof="#c8593a", shutter="#3f7f5a", trim="#ffffff": Casa grande de telhado de quatro águas com varanda de colunas, portas duplas e janelas com venezianas
- `sobrado` 7.3×9.5×7.8 m variantes: cinza, salmao | params: wall="#e6dcc8", roof="#a8402c", garage="#9aa3ad", trim="#ffffff": Casa de dois andares com garagem, porta de entrada, sacada sobre a garagem e telhado de duas águas
- `casa_moderna` 9.5×7.7×6.3 m variantes: escura, quente | params: wall="#f1f1ee", accent="#8f9aa5", wood="#a9743f": Casa de linhas retas: dois volumes, laje plana, janelas grandes e garagem

### Prédios e pontes
- `predio_apartamentos` 14.3×11.4×20.4 m variantes: azul, rosa, alto | params: floors=6, wall="#e9d8b4", accent="#b9855a", balconies=true: Prédio residencial com térreo de entrada, janelas e sacadas em cada andar, platibanda e caixa d'água
- `arranha_ceu` 22.1×22.2×71.8 m variantes: verde, escuro, alto | params: floors=14, glass="#5b8fb9", band="#dfe7ee": Torre de escritórios com fachada de vidro, faixas de laje a cada andar, base (pódio), coroa e antena
- `loja` 8.4×9.6×4.3 m variantes: padaria, mercado | params: wall="#f0e6d2", awning="#d9473a", sign="#3d6fb6": Loja de rua com vitrine grande, porta de vidro, toldo listrado e letreiro
- `galpao` 25×15×15.5 m variantes: azul, verde | params: wall="#c9cdd2", roof="#6d7783", door="#d9473a": Galpão industrial de telhado metálico, portão de enrolar, janelas altas e chaminé
- `ponte_viga` 40.5×14×5.6 m variantes: longa, baixa | params: length=24, height=4.5, river=true: Ponte de concreto sobre um rio: tabuleiro com pista, guarda-corpo, dois pilares com travessa e encontros nas pontas

### Em construção (animáveis)
- `casa_obra` 6.8×7.9×5 m variantes: fundacao, paredes, madeiramento | params: progress=1, brick="#b8573b", tile="#d2693a" | ETAPAS (etapa): Casa sendo construída: setProgress(p) mostra fundação (0–0.12), pilares (–0.25), paredes de tijolo (–0.55), laje (–0.65), madeiramento (–0.82) e telhas (–1)
- `predio_estrutura` 16.2×11.2×26.4 m variantes: baixo, meio | params: floors=8, progress=1, concrete="#b9b9b4" | ETAPAS (etapa): Esqueleto de concreto (pilares e lajes) subindo andar por andar: setProgress(p) constrói de 0 a todos os andares
- `rua_camadas` 8×8×1.4 m variantes: subleito, quase | params: progress=1 | ETAPAS (etapa): Bloco em corte mostrando as camadas de uma rua: solo compactado, sub-base de brita, base, asfalto base e capa de rolamento (+ faixa)
- `corte_terreno` 8×6×2.4 m variantes: so_rocha | params: progress=1 | ETAPAS (etapa): Bloco de solo em corte com grama, terra, argila e rocha — para explicar fundações e muros de arrimo
- `guindaste` 21×4×26.9 m variantes: baixo | params: height=22, jib=16, angle=0 | ETAPAS (etapa): Guindaste de torre com lança, contrapeso, cabo e gancho

### Árvores e plantas
- `arvore_redonda` 3.8×3.2×4.4 m variantes: clara, escura, grande, outono | params: height=5, leaf="#5fae4e", trunk="#8a5a34", seed=1: Árvore clássica de tronco marrom e copa arredondada de várias bolas
- `arvore_frutifera` 3.7×2.8×4.1 m variantes: laranja, limao | params: fruit="#e8452c", leaf="#4f9d4a", seed=2: Árvore de copa redonda com frutas (bolinhas coloridas), tipo laranjeira ou macieira
- `arvore_pinheiro` 3×3×6.2 m variantes: clara, alta, nevada | params: height=6, leaf="#2f7d4a", layers=4: Árvore em forma de cone, feita de camadas empilhadas
- `palmeira` 4.5×4.5×7.8 m variantes: baixa, alta | params: height=7, leaf="#4faa52", seed=1: Palmeira de tronco levemente curvo em gomos e folhas compridas
- `arbusto` 1.8×1.6×1.5 m variantes: florido, claro | params: leaf="#4f9d4a", flowers=false, seed=1: Moita baixa de bolas verdes, para cercas vivas e jardins

### Ruas e terreno
- `rua_reta` 11.7×20×0.2 m variantes: larga, sem_calcada, com_faixa | params: length=20, lanes=2, laneWidth=3.4, sidewalk=2.2, crosswalk=false: Trecho de rua com asfalto, faixa central, meio-fio e calçadas dos dois lados
- `cruzamento` 27×27×0.2 m variantes: longo | params: arm=8, lanes=2: Encontro de duas ruas em cruz, com faixas de pedestre nas quatro pontas e quarteirões de calçada nos cantos
- `chao` 20×20×0.3 m variantes: terra, areia, concreto, asfalto | params: type="grama", size=20, seed=1: Placa de chão quadrada com manchas de cor: grama, terra, areia, concreto ou asfalto
- `campo_futebol` 30×44×2.8 m variantes: pequeno | params: length=40, width=26: Gramado listrado com linhas brancas (área, círculo central) e duas traves

### Veículos
- `carro_sedan` 2.1×4.5×1.5 m variantes: azul, branco, taxi, verde | params: color="#d9473a", taxi=false | rodas giram ao mover: Carro de passeio com porta-malas
- `carro_hatch` 2.1×3.9×1.5 m variantes: vermelho, amarelo, preto | params: color="#3d6fb6" | rodas giram ao mover: Carro compacto de traseira alta
- `onibus` 2.6×10.1×3.3 m variantes: vermelho, azul, verde | params: color="#f2c94c", stripe="#3d6fb6" | rodas giram ao mover: Ônibus urbano com janelões, letreiro e portas
- `caminhao_cacamba` 2.6×9.1×2.9 m variantes: amarelo, azul, levantada | params: cab="#f28c28", bed="#7b8794", tilt=0 | ETAPAS (etapa) | rodas giram ao mover: Caminhão basculante para terra e entulho
- `betoneira` 2.6×9.5×4.4 m variantes: verde, azul | params: cab="#f2f2f2", drum="#f28c28" | gira sozinho | rodas giram ao mover: Caminhão de concreto com tambor listrado que gira (updateScenery(obj, t))
- `rolo_compressor` 1.7×4.4×3.1 m variantes: laranja, azul | params: color="#f2c94c" | rodas giram ao mover: Máquina de compactar asfalto e solo, com dois tambores de aço e cabine aberta
- `vibroacabadora` 3.4×6×3.2 m variantes: laranja, azul | params: color="#f2c94c": Máquina que espalha o asfalto quente em camada uniforme: caçamba na frente (recebe a massa do caminhão), esteiras e a régua alisadora atrás
- `espargidor` 2.9×17.3×3.3 m variantes: jorrando, vermelho | params: cab="#f2f2f2", tank="#2f3338", spraying=false | ETAPAS (etapa) | rodas giram ao mover: Caminhão-tanque que espalha o ligante asfáltico líquido (imprimação e pintura de ligação)

### Objetos de rua e obra
- `cone` 0.4×0.4×0.7 m variantes: amarelo | params: color="#f28c28": Cone laranja com faixa branca e base quadrada
- `barreira` 2×0.7×1.1 m variantes: longa | params: length=2: Cavalete com tábuas listradas vermelho/branco para isolar uma área
- `pilha_tijolos` 1.2×0.9×0.8 m variantes: baixa, clara | params: brick="#b8573b", rows=6: Pilha de tijolos sobre um pallet de madeira
- `saco_cimento` 1.3×0.4×0.4 m variantes: um, muitos | params: count=6: Pilha de sacos de cimento com etiqueta azul
- `carrinho_mao` 0.7×2.1×0.7 m variantes: azul, vermelho | params: color="#f2c94c" | rodas giram ao mover: Carrinho de obra com caçamba, uma roda e dois cabos
- `escada` 0.6×0.7×2.4 m variantes: alta | params: height=2.4: Escada de madeira inclinada (encostada)
- `poste_luz` 0.3×1.5×6 m variantes: baixo | params: height=6, color="#7b8794": Poste de rua com braço e lâmpada acesa
- `semaforo` 0.4×0.5×3.9 m variantes: amarelo, verde | params: state="vermelho": Semáforo de poste com três luzes; escolha qual está acesa
- `placa_pare` 1.2×0.1×2.9 m: Placa octogonal vermelha em poste
- `banco` 1.6×0.6×1 m variantes: verde | params: color="#a9743f": Banco de madeira com pés de ferro
- `cerca` 4.1×0.1×1 m variantes: branca | params: length=4, color="#a9743f": Trecho de cerca de madeira com mourões e duas travas
- `muro` 4.1×0.3×2.3 m variantes: tijolo, cinza | params: length=4, height=2.2, color="#e8dcc4": Trecho de muro de alvenaria com capeamento
- `hidrante` 0.4×0.3×0.8 m: Hidrante vermelho de calçada
- `lixeira` 0.6×0.7×0.9 m variantes: azul, amarela | params: color="#4f9d5a": Lixeira de rua com tampa
- `caixa_madeira` 0.9×0.9×0.8 m variantes: grande | params: size=0.8: Caixote de madeira com travessas em X
- `bueiro` 0.9×0.6×0.1 m: Grade de escoamento de água da chuva, ao nível do asfalto junto ao meio-fio

### Formas e peças livres (para montar qualquer coisa)
- `forma` 1×1×1 m variantes: tanque, bola, lampada | params: tipo="caixa", tamanho=[1,1,1], cor="#8a95a3", brilho=false, emissivo=false, apoiada=true: Peça básica para montar qualquer coisa (tanque, bloco, pilar, bola, lâmpada, quadro...)
- `tubo` 3.3×0.3×2.3 m variantes: vermelho, azul, cobre | params: pontos=[[0,0,0],[0,2,0],[3,2,0]], raio=0.15, cor="#9aa7b5": Tubulação por pontos [x,y,z] (cano, fio, mangueira, veia)

### Máquinas e processos animados
- `engrenagem` 2.4×0.4×2.4 m variantes: prata, vermelha | params: dentes=12, raio=1, cor="#c9a227", velocidade=60, fase=0 | gira sozinho: Engrenagem que gira sozinha (eixo para a câmera, +Z)
- `helice` 2.5×0.4×2.4 m variantes: turbina, ventilador | params: pas=4, raio=1.2, cor="#e8eef5", velocidade=360 | gira sozinho: Hélice, pá de ventilador ou turbina que gira sozinha (eixo +Z)
- `esteira` 6.4×1.1×1.1 m variantes: subindo, graos, areia | params: comprimento=6, largura=0.9, inclinacao=0, material="pedra", velocidade=1 | gira sozinho: Esteira com material andando sobre ela (pedra, areia, grão, carvão...)
- `monte` 3.2×3.1×1 m variantes: areia, terra, grao, pequeno | params: material="pedra", raio=1.6, progress=1 | ETAPAS (etapa): Pilha de pedra, areia, terra, grão, carvão ou asfalto
- `tanque` 2.6×2.6×3.1 m variantes: agua, leite, oleo, grao | params: raio=1.2, altura=3, liquido="#3fa5e0", casca="#cfd8e3", nivel=0.6 | ETAPAS (etapa): Reservatório (água, leite, grão, combustível) com casca transparente e o conteúdo visível
- `misturador` 2.8×2.8×2.3 m variantes: tinta, concreto, massa | params: raio=1.4, conteudo="#9a8f7a", pas="#f2c94c", velocidade=90 | gira sozinho: Tanque aberto com pás girando e o conteúdo sendo misturado (massa, tinta, concreto, comida)
- `escavadeira` 3.6×10.2×3.9 m variantes: laranja, rapida | params: cor="#f2c94c", ciclo=6, fase=0 | gira sozinho: Escavadeira que cava, gira e despeja em ciclo (update)
- `fabrica_processo` 25.2×15×22 m variantes: graos, areia | params: material="pedra", carregando=true, velocidade=1 | gira sozinho: Linha de processamento animada: 3 silos de matéria-prima, esteira subindo até um tambor rotativo aquecido (com chama), chaminé soltando fumaça e torre com bica de descarga
