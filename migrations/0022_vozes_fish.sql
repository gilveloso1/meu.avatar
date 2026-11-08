-- A voz clonada do Fish Audio (modelo de fala, src/structures/voz.ts) fica na mesma tabela das
-- vozes clonadas da HeyGen. No Fish não há voz criada no provedor: a clonagem vai junto em cada
-- pedido, e provider_voice_id guarda a gravação no R2. As vozes de antes são todas da HeyGen.
ALTER TABLE voices ADD COLUMN provider TEXT NOT NULL DEFAULT 'heygen';
