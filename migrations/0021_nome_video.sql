-- O nome que a pessoa dá a um vídeo ou imagem gerado (Renomear, na página do vídeo).
-- Vazio: as listas mostram a fala (ou a descrição, na imagem), como antes.
ALTER TABLE videos ADD COLUMN name TEXT;
