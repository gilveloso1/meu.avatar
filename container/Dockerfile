# Contêiner que trata o áudio e faz a edição rápida dos vídeos (src/audio.ts): ffmpeg estático,
# DeepFilterNet 3, OpenCV com o detector de rosto YuNet e um servidor HTTP em Python.
# Antes do build: ./baixar-binarios.sh (npm run deploy já chama). As rodas do
# OpenCV e do numpy vêm baixadas e conferidas (pasta rodas/): o build não usa a rede.
FROM mirror.gcr.io/library/python:3.12-slim-bookworm
WORKDIR /app
COPY ffmpeg deep-filter /usr/local/bin/
RUN --mount=type=bind,source=rodas,target=/tmp/rodas pip install --no-cache-dir --no-index --root-user-action=ignore /tmp/rodas/*.whl
COPY yunet.onnx tratar.sh editar.py rosto.py servidor.py /app/
RUN chmod +x /app/tratar.sh /usr/local/bin/ffmpeg /usr/local/bin/deep-filter
EXPOSE 8080
CMD ["python3", "/app/servidor.py"]
