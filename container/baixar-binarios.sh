#!/bin/sh
# Baixa para esta pasta os binários que a imagem usa, conferindo o SHA-256:
# - deep-filter: DeepFilterNet 3 (Rust, estático, modelo embutido), versão fixa;
# - ffmpeg: build estática do BtbN (GitHub), versão e SHA-256 fixos;
# - OpenCV (headless) e numpy para o Python 3.12 da imagem, versões fixas (PyPI);
# - yunet.onnx: o detector de rosto YuNet (opencv_zoo, 2023mar).
# O build da imagem não usa apt: a rede do ambiente cloud bloqueia o
# deb.debian.org. Os arquivos não vão para o git (.gitignore).
set -eu
cd "$(dirname "$0")"

# Funciona no Linux e no Mac: o sha256sum do Mac não tem --quiet (lá vai o shasum),
# o tar do Mac não tem --wildcards (ele já aceita o padrão) e pode não haver "pip".
if sha256sum --version 2>/dev/null | grep -q GNU; then confere() { sha256sum -c --quiet; }; else confere() { shasum -a 256 -c --quiet; }; fi
if tar --version | grep -q GNU; then CURINGA=--wildcards; else CURINGA=; fi

DF_VERSAO=0.5.6
DF_SHA256=70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da
if ! echo "$DF_SHA256  deep-filter" | confere 2>/dev/null; then
  curl -fsSL -o deep-filter "https://github.com/Rikorose/DeepFilterNet/releases/download/v$DF_VERSAO/deep-filter-$DF_VERSAO-x86_64-unknown-linux-musl"
  echo "$DF_SHA256  deep-filter" | confere
  chmod +x deep-filter
fi

# ffmpeg: a build do fim de outubro de 2026 do BtbN, com o SHA-256 fixo. A "latest" mudava a cada
# deploy numa máquina nova (o ffmpeg trocava sem nada mudar aqui); a do fim de cada mês o
# BtbN guarda, as diárias somem em umas duas semanas. Trocar de versão é mudar as três linhas.
FFMPEG_RELEASE=autobuild-2026-10-31-12-59
FFMPEG=ffmpeg-N-128227-g4811625b5f-linux64-gpl.tar.xz
FFMPEG_SHA256=67929be39bbb696f41d3295686597a439aeac902f61d82be660ccc1453c1fdfb
FFMPEG_VERSAO=$FFMPEG_RELEASE/$FFMPEG
if [ ! -f ffmpeg ] || [ "$(cat ffmpeg.versao 2>/dev/null)" != "$FFMPEG_VERSAO" ]; then
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  curl -fsSL -o "$T/$FFMPEG" "https://github.com/BtbN/FFmpeg-Builds/releases/download/$FFMPEG_RELEASE/$FFMPEG"
  (cd "$T" && echo "$FFMPEG_SHA256  $FFMPEG" | confere)
  tar -xJf "$T/$FFMPEG" -C "$T" --strip-components=2 $CURINGA '*/bin/ffmpeg'
  mv "$T/ffmpeg" ffmpeg && chmod +x ffmpeg
  echo "$FFMPEG_VERSAO" > ffmpeg.versao
fi

# Rodas do Python, conferidas pelo SHA-256 (pip download não confere sozinho).
mkdir -p rodas
OPENCV=opencv_python_headless-4.14.0.94-cp37-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl
OPENCV_SHA256=5e02669eac0ba67b2a22d7245af1e8ee1a2ef1185ee526a063d8f0555224bd52
NUMPY=numpy-2.5.4-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl
NUMPY_SHA256=fbde6962867ee75b48b0ee29b2b9372ec5d617799dbaf38e82dc0596f2f7738a
if ! (cd rodas && echo "$OPENCV_SHA256  $OPENCV" | confere 2>/dev/null && echo "$NUMPY_SHA256  $NUMPY" | confere 2>/dev/null); then
  rm -f rodas/*.whl
  python3 -m pip download --quiet --no-deps --only-binary=:all: --python-version 3.12 --implementation cp \
    --platform manylinux2014_x86_64 --platform manylinux_2_28_x86_64 \
    -d rodas opencv-python-headless==4.14.0.94 numpy==2.5.4
  (cd rodas && echo "$OPENCV_SHA256  $OPENCV" | confere && echo "$NUMPY_SHA256  $NUMPY" | confere)
fi

YUNET_SHA256=8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
if ! echo "$YUNET_SHA256  yunet.onnx" | confere 2>/dev/null; then
  curl -fsSL -o yunet.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
  echo "$YUNET_SHA256  yunet.onnx" | confere
fi
