# HyperFrames em Linux sem GPU (01/11/2026)

Teste do HyperFrames 0.8.228 (npm `hyperframes`, Apache-2.0) renderizando um clipe
transparente (selo e legenda) para sobrepor ao vídeo com ffmpeg, nos limites das
instâncias da Cloudflare. Só local, com Docker; nada publicado.

**Conclusão: serve no `standard-3`.** O WebM transparente de 10 s sai em 16 s do
`docker run` ao arquivo pronto (14 s de render), com pico de 0,6 GiB de 8 GiB, sem rede,
igual quadro a quadro entre renderizações, com transparência certa e acentos certos. Custa
uns US$ 0,001 por render (US$ 0,003 com os 30 s parado). O MOV (ProRes 4444) também passa,
mas é 1,5× mais lento e 170× maior, sem ganho para sobrepor: use WebM. Os riscos estão
no fim.

## Ambiente

- Máquina do ambiente cloud: Xeon 2,1 GHz, 4 núcleos, 15 GiB, Docker 29.9.2, cgroup v1,
  sem GPU. Limites com `docker run --cpus N --memory M --network none` e
  `HYPERFRAMES_NO_TELEMETRY=1`.
- Imagem (`Dockerfile`): Ubuntu 24.04, Node 22.23 (copiado da imagem oficial), Chrome
  for Testing headless shell 152.0.7977.30 baixado no build por
  `npx hyperframes browser ensure`, bibliotecas do Chrome e fonte DejaVu pelo apt do
  Ubuntu, ffmpeg/ffprobe estáticos do BtbN (`./baixar-ffmpeg.sh`, o mesmo build de
  `container/baixar-binarios.sh`), `hyperframes@0.8.228` e `gsap@3.15.0`.
- Composição (`video/index.html`): 720 × 1280, 10 s, 30 fps (300 quadros), fundo sem
  pintura, selo `R$ 49,90` que entra em 1 s com escala e duas linhas de legenda com uma
  palavra a cada 0,7 s. `npx hyperframes lint video`: 0 erros, 0 avisos.

### Como se chegou à imagem

1. **`npx hyperframes browser ensure` em `node:22-bookworm-slim`**: o download do Chrome
   funciona (vem de `storage.googleapis.com`, liberado), mas o binário não abre: faltam 21
   bibliotecas (`libglib-2.0.so.0`, `libnss3.so`, `libgbm.so.1`, `libX11.so.6`...), e o
   apt do Debian não instala nada porque `deb.debian.org` é recusado pelo proxy
   (`CONNECT tunnel failed, response 403`).
2. **Imagem do Playwright** (`mcr.microsoft.com/playwright:v1.56.1-noble`): baixa e tem
   Node 22.20, Chromium e 50 fontes, mas pesa 3,68 GB (traz Firefox e WebKit).
   Não foi usada nas medições.
3. **Escolhida: Ubuntu 24.04 + `browser ensure`.** O `archive.ubuntu.com` passa pelo
   proxy em https (em http o proxy responde 405), então o apt instala só as bibliotecas
   que o `ldd` do headless shell pede. No build, a CA do proxy entra como segredo do
   BuildKit (`--secret id=ca`) e não fica na imagem; fora do ambiente cloud o build é só
   `docker build -t hf-linux .`.

```bash
./baixar-ffmpeg.sh
```

```bash
docker build --network host --secret id=ca,src=/root/.ccr/ca-bundle.crt --build-arg HTTPS_PROXY=$HTTPS_PROXY -t hf-linux .
```

```bash
docker run --rm --cpus 2 --memory 8g --network none -e HYPERFRAMES_NO_TELEMETRY=1 -v $PWD/saida:/saida hf-linux npx hyperframes render video --format webm -o /saida/selo.webm
```

## Números

Tempo total: do `docker run` ao fim do contêiner (inclui subir o Node e o Chrome).
Render: o que o próprio HyperFrames informa. Pico: `memory.max_usage_in_bytes` do cgroup
lido no fim, dentro do contêiner (inclui o cache do arquivo gravado); o `docker stats`,
amostrado a cada ~1 s, deu 430 a 640 MiB, o mesmo.

| Instância | Formato | Total (rodadas) | Render | Captura | Pico | Arquivo | Custo | Com 30 s parado |
|---|---|---|---|---|---|---|---|---|
| `standard-3` (2 vCPU, 8 GiB, 16 GB) | WebM | 15,8 s (17,3 / 15,9 / 15,7 / 15,8) | 14,2 a 14,6 s | 13,8 a 14,1 s | 642 MiB | 255 KB | US$ 0,00097 | US$ 0,0028 |
| `standard-3` | MOV | 23,4 s (23,4 / 23,9 / 22,5) | 20,9 s | 20,4 a 20,5 s | 451 MiB | 42,5 MB | US$ 0,0014 | US$ 0,0033 |
| `standard-2` (1 vCPU, 6 GiB, 12 GB) | WebM | 24,7 s (25,9 / 24,7 / 24,0) | 22,3 s | 21,7 s | 644 MiB | 255 KB | US$ 0,00089 | US$ 0,0020 |
| `standard-2` | MOV | 38,9 s (39,9 / 38,9) | 37,3 s | 36,7 s | 480 MiB | 42,5 MB | US$ 0,0014 | US$ 0,0025 |

Por etapa (todas as rodadas iguais): compile 0,1 s, setup 0,3 a 0,5 s, captura com
codificação ao mesmo tempo (o resto), assemble 0,0 s; extract, audio e probe 0,0 s (não
há vídeo nem som). O HyperFrames reaproveita os quadros parados: 211 de 300 (70%) no
WebM.

Custo pelo tempo total, instância inteira cobrada (preços de `docs/operacao.md`):
`standard-3` = US$ 0,00006112 por segundo (2 × 0,000020 + 8 × 0,0000025 + 16 ×
0,00000007); `standard-2` = US$ 0,00003584 por segundo.

Sobreposição no vídeo de base (ffmpeg da imagem, H.264 `veryfast`, CRF 20, 10 s em
720 × 1280): 2,4 s com o WebM e 4,1 s com o MOV no `standard-3`; 5,1 s e 8,2 s no
`standard-2`.

### Como o render roda sem GPU

- `browserGpuMode probe → software (WebGL unavailable)`: Chrome com SwiftShader
  (`--use-gl=angle --use-angle=swiftshader`).
- Captura por screenshot (`Page.captureScreenshot`), não pela BeginFrame: o próprio
  resumo avisa "Screenshot capture (slower)".
- Com `--memory 8g`, entra o perfil de pouca memória (o limite é 8192 MiB, que é o
  próprio teto do perfil): 1 worker só. Forçar 2 workers (`--no-low-memory-mode -w 2`)
  dá 13,3 s de render contra 14,2 s, ganho pequeno; o padrão fica.
- O HyperFrames diz "4 cores detected" mesmo com `--cpus 2` (lê os núcleos da máquina,
  não a cota do cgroup); não atrapalhou porque o perfil de memória já prende em 1 worker.
- `/dev/shm` de 64 MB (padrão do Docker): o `hyperframes doctor` pede 256 MB, mas
  todos os renders passaram com 64 MB.

## Conferências

1. **Formatos (`ffprobe`)**. WebM: `vp9`, Profile 0, `yuv420p` na trilha principal com a
   etiqueta `ALPHA_MODE=1` (o alfa vai em bloco à parte, como deve), 720 × 1280, 30 fps,
   10,000 s. MOV: `prores` 4444 (`prores_ks`), `yuva444p12le`, 720 × 1280, 300 quadros,
   10,000 s.
2. **Sem rede.** Todos os renders com `--network none` terminaram com código 0, sem
   nenhuma linha de erro ou aviso no log, e nada foi baixado (o Chrome e as fontes já
   estão na imagem). Rodando sob `strace -e connect`, as únicas conexões fora do
   contêiner foram 3 tentativas de DNS (porta 53 de 8.8.8.8 e 8.8.4.4) que falham na hora
   com `ENETUNREACH`. Com um gancho no `dns.lookup` do Node, o nome procurado é
   **`fonts.googleapis.com`**: o compilador troca "DejaVu Sans" pela Inter embutida no
   pacote e tenta buscar no Google Fonts pesos e letras que faltam ("bundled_supplement").
   Sem rede, segue com a Inter embutida (cobre U+0000–00FF, todo o português). Numa rede
   interna sem saída (`docker network create --internal`) também falha na hora: 14,6 s no
   total. Com uma `@font-face` própria apontando para um arquivo ao lado do HTML, o
   compilador só embute o arquivo ("Embedded local font file: Inter-700.woff2") e
   **não procura nome nenhum** na rede. Fora isso, só conexões em 127.0.0.1 (o servidor
   de arquivos do HyperFrames e o Chrome) e sockets locais que não existem (nscd, D-Bus).
3. **Mesmo resultado.** `framemd5` de duas renderizações: WebM 300/300 quadros, 0
   diferentes (decodificado com `libvpx-vp9`, em `yuva420p`, com o alfa); MOV 300/300, 0
   diferentes, e os arquivos são idênticos byte a byte (o MOV do `standard-2` também). O
   WebM do `standard-2` tem os mesmos 300 quadros do `standard-3`. Os arquivos WebM mudam
   em alguns bytes de metadados do contêiner, não nos quadros.
4. **Transparência.** Base de 10 s com `testsrc2` (720 × 1280, 30 fps), sobreposição com
   `overlay=format=yuv420`, quadros a 0,5 s, 3 s e 7,5 s comparados com a base (pixel
   mudado = diferença acima de 48 em algum canal):

   | Quadro | MOV | WebM (`-c:v libvpx-vp9` antes do `-i`) | WebM sem o `-c:v` |
   |---|---|---|---|
   | 0,5 s | 0,42%: só "Esse" (x 58–193, y 928–979) | igual ao MOV | 99,99% (fundo preto) |
   | 3 s | 7,14%: selo (x 320–663, y 120–237) e legenda (x 58–661, y 928–1055) | 7,15%, mesmas caixas | 99,57% |
   | 7,5 s | 5,48%: selo e legenda (y 917–1064) | 5,48%, mesmas caixas | 99,53% |

   Fora das caixas, só pixels soltos de ruído do H.264 (a base anda). Sem o
   `-c:v libvpx-vp9` antes do `-i`, o decodificador nativo do ffmpeg ignora o alfa e o
   clipe cobre o vídeo inteiro de preto: na exportação, esse parâmetro é obrigatório.
5. **Fontes.** `conferencia.png`: os quadros de 0,5 s, 3 s e 7,5 s sobre a base e, à
   direita, uma cópia da composição com "Promoção só já, você não é açúcar!" (as frases
   do teste não têm acento). Tudo certo, sem quadrado no lugar de letra. A fonte que sai
   é a Inter embutida no `hyperframes`, não a DejaVu do sistema: o compilador mapeia
   DejaVu, Liberation, Noto Sans, Arial e Helvetica para Inter. Uma fonte fora da lista
   (teste com "Lobster") dá aviso "No deterministic font mapping" e cai na fonte do
   sistema, sem travar (16 s de render).
6. **Peso.** Imagem de 1,73 GB no disco, 460 MB comprimida (`docker save | gzip`). Por
   camada: ffmpeg + ffprobe 353 MB, Chrome 274 MB, bibliotecas do apt 257 MB,
   `node_modules` 154 MB, Node 125 MB. Partida a frio com a imagem já no disco:
   `docker run ... true` 0,2 s, `npx hyperframes --version` 0,5 s, e o primeiro render
   igual aos outros (15,9 s logo depois de um `docker load` de 13,1 s). Na Cloudflare, a
   primeira partida ainda baixa os 460 MB.
7. **`standard-2`.** WebM em 24,7 s (render de 22,3 s), MOV em 38,9 s, mesma memória.
   O `standard-3` não passou de 60 s em nenhuma rodada, então não houve o que investigar.
8. **Custo.** Na tabela. WebM no `standard-3`: US$ 0,001 por render, US$ 0,003 com os
   30 s parado antes de dormir. O `standard-2` sai mais barato quando para logo (US$ 0,002
   contra 0,003 com os 30 s parado), mas leva 9 s a mais.

## Riscos e o que fazer antes de levar ao produto

- **DNS no contêiner da Cloudflare.** Aqui a busca pelo `fonts.googleapis.com` falha na
  hora. Se lá o DNS demorar a responder em vez de falhar, o compilador espera até 20 s
  por família (2 tentativas de 8 s, `DEFAULT_FONT_FETCH_RETRY_POLICY`). Para não
  depender disso: toda fonte da composição com `@font-face` própria e o arquivo ao lado
  (testado: nenhuma busca na rede).
- **Mesmo resultado entre ambientes.** Com internet, o compilador completa a Inter com os
  arquivos do Google Fonts; sem internet, usa só a embutida. O mesmo HTML pode sair
  diferente no computador e no contêiner. A `@font-face` própria resolve isso também.
- **Imagem grande.** 460 MB comprimida contra 118 MB do `Exporter`. Dá para cortar: o
  ffprobe não precisa ir (o doctor pede, o render não foi testado sem ele), e um ffmpeg
  só com libvpx, ProRes e libx264 seria bem menor que os 177 MB do build "gpl" completo.
- **Composição mais pesada.** Só se testou texto e escala. Vídeo dentro da composição,
  sombras grandes, filtros e WebGL rodam no SwiftShader, na CPU; medir antes de usar.
- **O WebM precisa de `-c:v libvpx-vp9` antes do `-i`** em todo ffmpeg que o lê, ou o
  alfa some (conferência 4).
