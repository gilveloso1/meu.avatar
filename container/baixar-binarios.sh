#!/bin/sh
# Baixa para esta pasta os binários que a imagem usa, conferindo o SHA-256:
# - deep-filter: DeepFilterNet 3 (Rust, estático, modelo embutido), versão fixa;
# - ffmpeg: build estática do BtbN (GitHub), conferida contra o checksums.sha256
#   da mesma release.
# O build da imagem não usa apt: a rede do ambiente cloud bloqueia o
# deb.debian.org. Os arquivos não vão para o git (.gitignore).
set -eu
cd "$(dirname "$0")"

DF_VERSAO=0.5.6
DF_SHA256=70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da
if ! echo "$DF_SHA256  deep-filter" | sha256sum -c --quiet 2>/dev/null; then
  curl -fsSL -o deep-filter "https://github.com/Rikorose/DeepFilterNet/releases/download/v$DF_VERSAO/deep-filter-$DF_VERSAO-x86_64-unknown-linux-musl"
  echo "$DF_SHA256  deep-filter" | sha256sum -c --quiet
  chmod +x deep-filter
fi

if [ ! -f ffmpeg ]; then
  BASE=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest
  PACOTE=ffmpeg-master-latest-linux64-gpl.tar.xz
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  curl -fsSL -o "$T/$PACOTE" "$BASE/$PACOTE"
  curl -fsSL -o "$T/checksums.sha256" "$BASE/checksums.sha256"
  (cd "$T" && grep " $PACOTE\$" checksums.sha256 | sha256sum -c --quiet)
  tar -xJf "$T/$PACOTE" -C "$T" --strip-components=2 --wildcards '*/bin/ffmpeg'
  mv "$T/ffmpeg" ffmpeg && chmod +x ffmpeg
fi
