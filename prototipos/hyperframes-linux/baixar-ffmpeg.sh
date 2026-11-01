#!/bin/sh
# Baixa para esta pasta o ffmpeg e o ffprobe estáticos do BtbN (o mesmo build de
# container/baixar-binarios.sh), conferidos pelo checksums.sha256 da release.
set -eu
cd "$(dirname "$0")"
[ -f ffmpeg ] && [ -f ffprobe ] && exit 0
BASE=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest
PACOTE=ffmpeg-master-latest-linux64-gpl.tar.xz
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
curl -fsSL -o "$T/$PACOTE" "$BASE/$PACOTE"
curl -fsSL -o "$T/checksums.sha256" "$BASE/checksums.sha256"
(cd "$T" && grep " $PACOTE\$" checksums.sha256 | sha256sum -c --quiet)
tar -xJf "$T/$PACOTE" -C "$T" --strip-components=2 --wildcards '*/bin/ffmpeg' '*/bin/ffprobe'
mv "$T/ffmpeg" "$T/ffprobe" . && chmod +x ffmpeg ffprobe
