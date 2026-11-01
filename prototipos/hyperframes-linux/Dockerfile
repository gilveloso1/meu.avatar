# Teste do HyperFrames em Linux sem GPU (não vai para produção; ver RESULTADOS.md).
#
# Ubuntu 24.04 + Node 22 (copiado da imagem oficial) + Chrome headless shell baixado
# pelo próprio `hyperframes browser ensure` + ffmpeg/ffprobe estáticos do BtbN.
# As bibliotecas do Chrome e as fontes vêm do apt do Ubuntu: o deb.debian.org é
# bloqueado na rede do ambiente cloud, então a base Debian (node:22-slim) não serve.
#
# Antes do build: ./baixar-ffmpeg.sh. No ambiente cloud (proxy com CA própria):
#   docker build --network host --secret id=ca,src=/root/.ccr/ca-bundle.crt \
#     --build-arg HTTPS_PROXY=$HTTPS_PROXY -t hf-linux .
# Fora dele, só `docker build -t hf-linux .`. Nada do proxy fica na imagem.
FROM mirror.gcr.io/library/node:22-bookworm-slim AS node

FROM mirror.gcr.io/library/ubuntu:24.04
ARG HTTPS_PROXY
ENV DEBIAN_FRONTEND=noninteractive HYPERFRAMES_NO_TELEMETRY=1

# Só as bibliotecas que o `ldd` do chrome-headless-shell pede, o fontconfig e uma
# fonte com acentos (DejaVu).
RUN --mount=type=secret,id=ca,target=/ca.crt,required=false,mode=0444 \
    set -e; \
    if [ -f /ca.crt ]; then \
      sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources; \
      APT="-o Acquire::https::CAInfo=/ca.crt -o Acquire::https::Proxy=$HTTPS_PROXY"; \
    else APT=""; fi; \
    apt-get $APT update; \
    apt-get $APT install -y --no-install-recommends \
      libglib2.0-0t64 libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
      libatspi2.0-0t64 libdbus-1-3 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxrandr2 libxkbcommon0 libgbm1 libexpat1 libasound2t64 \
      fontconfig fonts-dejavu-core; \
    rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY ffmpeg ffprobe /usr/local/bin/

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca,target=/ca.crt,required=false \
    if [ -f /ca.crt ]; then export NODE_EXTRA_CA_CERTS=/ca.crt; fi; \
    npm ci --omit=dev && npm cache clean --force
RUN --mount=type=secret,id=ca,target=/ca.crt,required=false \
    if [ -f /ca.crt ]; then export NODE_EXTRA_CA_CERTS=/ca.crt; fi; \
    npx hyperframes browser ensure
COPY video ./video
CMD ["npx", "hyperframes", "render", "video", "--format", "webm", "-o", "/saida/selo.webm"]
