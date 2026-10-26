-- Estrutura que gerou cada vídeo (src/structures/): o formulário, o prompt de
-- sistema e o jeito de chamar o modelo. settings guarda, em JSON, as
-- configurações próprias da estrutura (no HeyGen: voz, expressividade e o
-- movimento como foi). Todos os vídeos de antes saíram do formulário do Wan.
ALTER TABLE videos ADD COLUMN structure TEXT;
ALTER TABLE videos ADD COLUMN settings TEXT;

UPDATE videos SET structure = 'wan' WHERE structure IS NULL;
