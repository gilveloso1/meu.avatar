-- Onde está o rosto do avatar no vídeo (container/rosto.py, YuNet), em JSON:
-- {"x", "y", "altura"} em frações do quadro, ou {} se não achou. A prévia da
-- edição rápida e o contêiner miram o zoom nele. Achado na primeira vez que a
-- prévia abre e guardado; null enquanto ninguém pediu.
ALTER TABLE videos ADD COLUMN face TEXT;
