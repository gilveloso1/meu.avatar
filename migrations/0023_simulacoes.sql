-- A simulação de um gerar_* do agente (src/api.ts): o sim da pessoa vale para um pedido, uma vez
-- e por pouco tempo. O código é sorteado e aqui fica só o hash dele, como nas sessões; `pedido` é
-- o resumo do que foi simulado (conta, tipo, projeto, modelo e campos) e `custo`, o que a pessoa
-- viu. Gerar apaga a linha: o mesmo código não gera duas vezes.
CREATE TABLE simulacoes (
    codigo_hash TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pedido      TEXT    NOT NULL,
    custo       REAL,
    created_at  TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL
);

CREATE INDEX simulacoes_expira ON simulacoes (expires_at);
