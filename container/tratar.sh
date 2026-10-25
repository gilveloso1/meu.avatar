#!/bin/sh
# Trata o áudio de um vídeo do Wan (receita "E2", testada em 25/10/2026):
#   1. recupera os picos cortados (adeclip), com 6 dB de folga;
#   2. realce de voz por IA (DeepFilterNet 3) duas vezes;
#   3. corta graves inaudíveis, suaviza agudos e "s";
#   4. volume das redes: −14 LUFS e pico até −1,5 dBFS (loudnorm em duas
#      passadas, linear: só ganho, sem "bombear").
# O vídeo é copiado sem recodificar; só o áudio muda.
#   tratar.sh entrada.mp4 saida.mp4
set -eu
IN=$1; OUT=$2
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/p1" "$T/p2"

ffmpeg -nostdin -v error -y -i "$IN" -af "aresample=48000,adeclip,volume=-6dB" -ac 1 -c:a pcm_s16le "$T/pre.wav"
deep-filter -o "$T/p1" "$T/pre.wav" >/dev/null 2>&1
deep-filter --pf -o "$T/p2" "$T/p1/pre.wav" >/dev/null 2>&1

CHAIN="highpass=f=70,highshelf=f=5000:g=-5,deesser=i=0.3:m=0.5:f=0.5"
LN="loudnorm=I=-14:TP=-1.5:LRA=11"
ffmpeg -nostdin -hide_banner -i "$T/p2/pre.wav" -af "$CHAIN,$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p' > "$T/m.json"
v() { sed -n "s/.*\"$1\" : \"\\([^\"]*\\)\".*/\\1/p" "$T/m.json"; }
ffmpeg -nostdin -v error -y -i "$IN" -i "$T/p2/pre.wav" -map 0:v -map 1:a -c:v copy \
  -af "$CHAIN,$LN:measured_I=$(v input_i):measured_TP=$(v input_tp):measured_LRA=$(v input_lra):measured_thresh=$(v input_thresh):offset=$(v target_offset):linear=true,aresample=44100" \
  -ac 2 -c:a aac -b:a 192k -movflags +faststart "$OUT"
