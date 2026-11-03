#!/bin/sh
# Baixa para esta pasta o que a imagem de render usa, conferindo o SHA-256:
# - ffmpeg e ffprobe: build estática do BtbN, a mesma versão fixa de container/baixar-binarios.sh;
# - fontes/: as fontes livres que o agente pode usar (Google Fonts, licença SIL OFL 1.1,
#   num commit fixo), com nomes simples e a licença de cada família, e a Noto Color Emoji, que a
#   imagem instala no sistema para os emojis saírem em qualquer fonte.
# Os arquivos não vão para o git (.gitignore).
set -eu
cd "$(dirname "$0")"

if sha256sum --version 2>/dev/null | grep -q GNU; then confere() { sha256sum -c --quiet; }; else confere() { shasum -a 256 -c --quiet; }; fi
if tar --version | grep -q GNU; then CURINGA=--wildcards; else CURINGA=; fi

# ffmpeg: a build do fim de outubro de 2026 do BtbN, com o SHA-256 fixo. A "latest" mudava a cada
# deploy numa máquina nova (o ffmpeg trocava sem nada mudar aqui); a do fim de cada mês o
# BtbN guarda, as diárias somem em umas duas semanas. Trocar de versão é mudar as três linhas.
FFMPEG_RELEASE=autobuild-2026-10-31-12-59
FFMPEG=ffmpeg-N-128227-g4811625b5f-linux64-gpl.tar.xz
FFMPEG_SHA256=67929be39bbb696f41d3295686597a439aeac902f61d82be660ccc1453c1fdfb
FFMPEG_VERSAO=$FFMPEG_RELEASE/$FFMPEG
if [ ! -f ffmpeg ] || [ ! -f ffprobe ] || [ "$(cat ffmpeg.versao 2>/dev/null)" != "$FFMPEG_VERSAO" ]; then
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  curl -fsSL -o "$T/$FFMPEG" "https://github.com/BtbN/FFmpeg-Builds/releases/download/$FFMPEG_RELEASE/$FFMPEG"
  (cd "$T" && echo "$FFMPEG_SHA256  $FFMPEG" | confere)
  tar -xJf "$T/$FFMPEG" -C "$T" --strip-components=2 $CURINGA '*/bin/ffmpeg' '*/bin/ffprobe'
  mv "$T/ffmpeg" "$T/ffprobe" . && chmod +x ffmpeg ffprobe
  echo "$FFMPEG_VERSAO" > ffmpeg.versao
fi

# google/fonts em 02/11/2026. Cada linha: SHA-256, nome aqui, caminho em ofl/.
COMMIT=6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec
mkdir -p fontes
while read -r sha nome caminho; do
  [ -n "$sha" ] || continue
  if ! (cd fontes && echo "$sha  $nome" | confere >/dev/null 2>&1); then
    curl -fsSL -o "fontes/$nome" "https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl/$caminho"
    (cd fontes && echo "$sha  $nome" | confere)
  fi
done <<'LISTA'
0e7f0a3e924c9a86478fc6fc2946de2e4ab8fc704ed72ee40434ade94bb9b0c6 TikTokSans.ttf tiktoksans/TikTokSans%5Bopsz%2Cslnt%2Cwdth%2Cwght%5D.ttf
29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031 Inter.ttf inter/Inter%5Bopsz%2Cwght%5D.ttf
0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7 Montserrat.ttf montserrat/Montserrat%5Bwght%5D.ttf
d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134 Roboto.ttf roboto/Roboto%5Bwdth%2Cwght%5D.ttf
36643644f318a812aab2d2ed3bb98f8cf0872527f835fe9398d95fe6b9adb878 OpenSans.ttf opensans/OpenSans%5Bwdth%2Cwght%5D.ttf
5b38c246e255a12f5712d640d56bcced0472466fc68983d2d0410ec0457c2817 Oswald.ttf oswald/Oswald%5Bwght%5D.ttf
c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6 PlayfairDisplay.ttf playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf
7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba Poppins-400.ttf poppins/Poppins-Regular.ttf
90373e7d838d32468438fc3e152dca0bdb12edcab99ea639f158790b1ba1fd05 Poppins-500.ttf poppins/Poppins-Medium.ttf
d3bf1bdaf0550e83da9ac0b1d1d9fe6db086835a83aa28578e609a394b9a0286 Poppins-600.ttf poppins/Poppins-SemiBold.ttf
983676516167748b74de6f4771fb384c664fd913acb8b471122ecacf5da5ea6c Poppins-700.ttf poppins/Poppins-Bold.ttf
f2ab17c1a63a0ecc12c2461848fc8a469395e3cd2d641803e889c643d9f958e1 Poppins-800.ttf poppins/Poppins-ExtraBold.ttf
d82aaaf98a9283f9a8edd24e51173337d8eaf09e25cd3d98831f8ec8461748a1 Poppins-900.ttf poppins/Poppins-Black.ttf
a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab Anton.ttf anton/Anton-Regular.ttf
08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73 BebasNeue.ttf bebasneue/BebasNeue-Regular.ttf
dd9a89a019b4849f66ab75455fe7bdf931311042cbb0f0f97acc061539703180 ArchivoBlack.ttf archivoblack/ArchivoBlack-Regular.ttf
72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af CourierPrime-400.ttf courierprime/CourierPrime-Regular.ttf
ff1f38786c849d1c41fa8e447960abdb2bd75fdfb0cfcdeb524fad65a5af3638 CourierPrime-700.ttf courierprime/CourierPrime-Bold.ttf
5b6c0d5334a7bf77dea52b975c5a0c408878c0f7115ed5b6fb151f634b7bf701 Pacifico.ttf pacifico/Pacifico-Regular.ttf
4d82a18d8d95f60ba883ce242bbadbf84a576e987745dd7ba38d71c67cff2d73 NotoColorEmoji.ttf notocoloremoji/NotoColorEmoji-Regular.ttf
LISTA

# A licença de cada família vai junto com os arquivos.
for d in tiktoksans inter montserrat roboto opensans oswald playfairdisplay poppins anton bebasneue archivoblack courierprime pacifico notocoloremoji; do
  [ -f "fontes/OFL-$d.txt" ] || curl -fsSL -o "fontes/OFL-$d.txt" "https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl/$d/OFL.txt"
done
