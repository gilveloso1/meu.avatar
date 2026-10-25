-- O prompt exatamente como foi para o modelo (o da pessoa mais a orientação
-- fixa de src/prompt.ts), para comparar resultados quando a orientação mudar.
ALTER TABLE videos ADD COLUMN request_prompt TEXT;
