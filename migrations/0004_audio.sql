-- Tratamento do áudio no contêiner (src/audio.ts). Quando o MP4 chega do
-- OpenRouter, audio_status vira 'pending'; o agendamento manda um vídeo por
-- vez para o contêiner ('processing') e grava a versão tratada em
-- processed_key ('done') ou o motivo da falha em audio_error ('failed').
-- O original continua em video_key. Vídeos antigos ficam com null.
ALTER TABLE videos ADD COLUMN audio_status TEXT;
ALTER TABLE videos ADD COLUMN processed_key TEXT;
ALTER TABLE videos ADD COLUMN audio_error TEXT;
ALTER TABLE videos ADD COLUMN audio_started_at TEXT;

CREATE INDEX videos_audio ON videos (audio_status);
