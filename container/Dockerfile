# Contêiner que trata o áudio e faz a edição rápida dos vídeos (src/audio.ts): ffmpeg estático,
# DeepFilterNet 3 e um servidor HTTP em Python. Antes do build:
# ./baixar-binarios.sh (npm run deploy já chama).
FROM mirror.gcr.io/library/python:3.12-slim-bookworm
WORKDIR /app
COPY ffmpeg deep-filter /usr/local/bin/
COPY tratar.sh editar.py servidor.py /app/
RUN chmod +x /app/tratar.sh /usr/local/bin/ffmpeg /usr/local/bin/deep-filter
EXPOSE 8080
CMD ["python3", "/app/servidor.py"]
