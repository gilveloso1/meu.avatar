#!/bin/sh
# Vídeos, imagem e música de exemplo para os protótipos (ffmpeg). Saem em midia/.
set -e
cd "$(dirname "$0")"
mkdir -p midia
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
clip() { # nome rótulo segundos cor tom
  ffmpeg -loglevel error -y \
    -f lavfi -i "color=c=$4:s=360x640:r=24:d=$3" \
    -f lavfi -i "sine=f=$5:d=$3,volume=0.08" \
    -vf "drawtext=fontfile=$F:text='$2':fontcolor=white:fontsize=40:x=(w-tw)/2:y=h*0.42,drawtext=fontfile=$F:text='%{pts\:hms}':fontcolor=white@0.8:fontsize=24:x=(w-tw)/2:y=h*0.52" \
    -c:v libx264 -profile:v baseline -pix_fmt yuv420p -crf 30 -g 24 -c:a aac -b:a 48k -shortest -movflags +faststart "midia/$1.mp4"
}
clip gancho-1 "Gancho 1" 3 0x6750a4 330
clip gancho-2 "Gancho 2" 3 0x8a3a5c 392
clip gancho-3 "Gancho 3" 4 0x2f6f6a 440
clip corpo "Corpo" 8 0x34495e 262
clip cta-a "CTA A" 3 0xb5542c 523
clip cta-b "CTA B" 3 0x4a6a2a 587
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=360x640:r=24:d=4" -f lavfi -i "anoisesrc=d=4:a=0.02" \
  -vf "drawtext=fontfile=$F:text='B-roll':fontcolor=white:fontsize=40:box=1:boxcolor=black@0.5:x=(w-tw)/2:y=h*0.42" \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p -crf 32 -g 24 -c:a aac -b:a 32k -shortest -movflags +faststart midia/broll.mp4
ffmpeg -loglevel error -y -f lavfi -i "color=c=0xf2e6d0:s=720x1280" -frames:v 1 \
  -vf "drawbox=x=210:y=420:w=300:h=440:color=0xb5542c:t=fill,drawtext=fontfile=$F:text='Produto':fontcolor=0x3a2a1a:fontsize=64:x=(w-tw)/2:y=940" midia/produto.jpg
ffmpeg -loglevel error -y -f lavfi -i "sine=f=196:d=16" -f lavfi -i "sine=f=247:d=16" -f lavfi -i "sine=f=294:d=16" \
  -filter_complex "[0][1][2]amix=inputs=3,volume=0.5,afade=t=in:d=1,afade=t=out:st=15:d=1,tremolo=f=2:d=0.4" -c:a libmp3lame -b:a 64k midia/musica.mp3
ls -la midia
