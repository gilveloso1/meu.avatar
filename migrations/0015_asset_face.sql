-- Onde está o rosto em cada imagem dos avatares (o mesmo JSON de videos.face),
-- para a miniatura enquadrar. Achado pelo agendamento; {} quando não há rosto.
ALTER TABLE avatar_assets ADD COLUMN face TEXT;
