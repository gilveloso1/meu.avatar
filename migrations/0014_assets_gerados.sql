-- Ativo gerado não tem arquivo próprio: as cópias antigas passam a apontar para o
-- vídeo. Regra única: source_video vazio quer dizer que o arquivo é do avatar.
UPDATE avatar_assets
SET key = (SELECT COALESCE(v.edited_key, v.processed_key, v.video_key) FROM videos v WHERE v.id = avatar_assets.source_video)
WHERE source_video IS NOT NULL
  AND EXISTS (SELECT 1 FROM videos v WHERE v.id = avatar_assets.source_video AND v.video_key IS NOT NULL);
