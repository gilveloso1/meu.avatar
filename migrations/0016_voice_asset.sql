-- A voz clonada da gravação de um avatar: asset_id é o ativo de onde ela veio.
-- Trocar a gravação do avatar aponta para outro ativo, e a voz é clonada de novo.
ALTER TABLE voices ADD COLUMN asset_id TEXT;
CREATE INDEX voices_by_asset ON voices (asset_id);
