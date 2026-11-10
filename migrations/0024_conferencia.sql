-- Quando o agendamento conferiu o vídeo pela última vez no provedor (src/db.ts, openVideos): a
-- fila roda pelo menos conferido, para dez vídeos presos não segurarem os mais novos. Não mexe
-- no updated_at (conferir não é uma mudança do vídeo).
ALTER TABLE videos ADD COLUMN checked_at TEXT;
