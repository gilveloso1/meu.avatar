"""
Muitos dados de exemplo no banco LOCAL (wrangler dev), para ver o painel do administrador
(/painel) com volume: contas, vídeos de vários modelos ao longo de 120 dias, falhas, projetos,
exportações, avatares, ativos e tokens. Nunca mexe no remoto e não sobe arquivos ao R2 (os
vídeos daqui não abrem no player; servem só para os números).

Uso: npm run exemplos:painel            (põe os dados; rodar de novo troca pelos novos)
     npm run exemplos:painel -- --limpar (tira só o que este script pôs)

Tudo o que ele cria é marcado: ids começam com "eeeeeeee-" e os e-mails terminam em
"@exemplo-painel.test". Há modelos que ainda não existem no site (Veo, Kling...), para ver a
lista de gasto por modelo crescer; aparecem pelo id.
"""

from __future__ import annotations

import datetime
import random
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

DIAS = 120
PESSOAS = 24
VIDEOS = 900
PROJETOS = 90
EXPORTACOES = 260
AVATARES = 45
ATIVOS = 380
TOKENS = 12
# (estrutura, peso na escolha, US$ por segundo, durações possíveis)
MODELOS = [
    ("wan", 30, 0.05, [5, 10, 15, 25]),
    ("heygen", 34, 0.05, [8, 10, 12, 15, 20, 30]),
    ("seedance", 8, 0.12, [5, 10, 15]),
    ("aleph", 6, 0.28, [5, 8, 10]),
    ("veo-3.1-fast", 8, 0.10, [4, 6, 8]),
    ("kling-v3", 6, 0.168, [5, 10, 15]),
    ("seedance-2.5", 5, 0.09, [5, 10, 20]),
    ("veo-3.1", 3, 0.40, [4, 8]),
]
FALAS = [
    "Oi! Hoje eu vou mostrar meu produto favorito.",
    "Só hoje: frete grátis para todo o Brasil.",
    "Três dicas para economizar na conta de luz.",
    "Chegou a nova coleção. Peças leves e preço justo.",
    "Você sabia que beber água logo cedo ajuda a acordar o corpo?",
    "Obrigado pelos 10 mil seguidores! Vem aí um sorteio.",
]
NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabi", "Heitor", "Iara", "João", "Kátia", "Lucas",
         "Marina", "Nina", "Otávio", "Paula", "Rafa", "Sofia", "Tiago", "Úrsula", "Vitor", "Wanda", "Xavier", "Yara"]
PREFIXO = "eeeeeeee-"
DOMINIO = "@exemplo-painel.test"


def uid() -> str:
    return PREFIXO + str(uuid.uuid4())[9:]


def q(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def quando(agora: datetime.datetime, max_dias: int = DIAS) -> str:
    # Mais recentes com mais peso: o uso cresce ao longo do tempo.
    dias = max_dias * (random.random() ** 1.6)
    return (agora - datetime.timedelta(days=dias, seconds=random.randint(0, 86_399))).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def limpar() -> list[str]:
    return [
        f"DELETE FROM exports WHERE id LIKE '{PREFIXO}%';",
        f"DELETE FROM projects WHERE id LIKE '{PREFIXO}%';",
        f"DELETE FROM avatar_assets WHERE id LIKE '{PREFIXO}%';",
        f"DELETE FROM avatars WHERE id LIKE '{PREFIXO}%';",
        f"DELETE FROM videos WHERE id LIKE '{PREFIXO}%';",
        f"DELETE FROM api_tokens WHERE id LIKE '{PREFIXO}%';",
        f"DELETE FROM users WHERE email LIKE '%{DOMINIO}';",
    ]


def popular(agora: datetime.datetime) -> list[str]:
    random.seed(7)
    sql: list[str] = []
    for i, nome in enumerate(NOMES[:PESSOAS]):
        sql.append(
            "INSERT INTO users (email, name, role, password_hash, created_at) VALUES "
            f"({q(f'pessoa{i + 1}{DOMINIO}')}, {q(nome)}, 'member', NULL, {q(quando(agora))});"
        )
    # As contas acima ganham os ids seguintes; o resto aponta para elas pelo e-mail.
    dono = lambda: f"(SELECT id FROM users WHERE email = {q(f'pessoa{random.randint(1, PESSOAS)}{DOMINIO}')})"

    pesos = [m[1] for m in MODELOS]
    for _ in range(VIDEOS):
        estrutura, _, preco, duracoes = random.choices(MODELOS, weights=pesos)[0]
        duracao = random.choice(duracoes)
        criado = quando(agora)
        idade_h = (agora - datetime.datetime.fromisoformat(criado.replace("Z", "+00:00"))).total_seconds() / 3600
        sorte = random.random()
        if idade_h < 2 and sorte < 0.5:
            status = random.choice(["submitting", "pending", "in_progress"])
        elif sorte < 0.07:
            status = "failed"
        elif sorte < 0.08:
            status = random.choice(["cancelled", "expired"])
        else:
            status = "completed"
        pronto = status == "completed"
        custo = round(preco * duracao * random.uniform(0.95, 1.1), 4) if pronto else None
        audio = random.choices(["done", "failed", None], weights=[70, 3, 27])[0] if pronto else None
        edicao = random.choices([None, "done", "failed"], weights=[80, 17, 3])[0] if pronto else None
        id_ = uid()
        sql.append(
            "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, video_key, cost, error, "
            "user_id, structure, audio_status, edit_status, created_at, updated_at) VALUES "
            f"({q(id_)}, {q(status)}, {q(random.choice(FALAS))}, {q(estrutura)}, {duracao}, '720p', "
            f"{q(random.choice(['9:16', '9:16', '16:9', '1:1']))}, {q(f'videos/{id_}.mp4' if pronto else None)}, "
            f"{q(custo)}, {q('Falha de exemplo' if status == 'failed' else None)}, {dono()}, {q(estrutura)}, "
            f"{q(audio)}, {q(edicao)}, {q(criado)}, {q(criado)});"
        )

    projetos = []
    for i in range(PROJETOS):
        id_, criado = uid(), quando(agora)
        projetos.append((id_, criado))
        sql.append(
            "INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES "
            f"({q(id_)}, {dono()}, {q(f'Projeto de exemplo {i + 1}')}, '{{\"blocks\":[],\"finals\":[],\"edges\":[]}}', {q(criado)}, {q(criado)});"
        )
    for _ in range(EXPORTACOES):
        projeto, desde = random.choice(projetos)
        criado = max(desde, quando(agora))
        status = random.choices(["done", "failed"], weights=[92, 8])[0]
        expira = (datetime.datetime.fromisoformat(criado.replace("Z", "+00:00")) + datetime.timedelta(days=7)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        sql.append(
            "INSERT INTO exports (id, project_id, status, step, total, plan, error, created_at, expires_at) VALUES "
            f"({q(uid())}, {q(projeto)}, {q(status)}, 3, 3, '{{\"trechos\":[],\"versoes\":[]}}', "
            f"{q('Falha de exemplo' if status == 'failed' else None)}, {q(criado)}, {q(expira)});"
        )

    avatares = []
    for i in range(AVATARES):
        id_, criado = uid(), quando(agora)
        avatares.append(id_)
        sql.append(
            "INSERT INTO avatars (id, user_id, name, created_at, updated_at) VALUES "
            f"({q(id_)}, {dono()}, {q(f'Avatar de exemplo {i + 1}')}, {q(criado)}, {q(criado)});"
        )
    for i in range(ATIVOS):
        tipo, mime = random.choice([("image", "image/jpeg"), ("video", "video/mp4"), ("audio", "audio/mpeg")])
        id_ = uid()
        sql.append(
            "INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, created_at) VALUES "
            f"({q(id_)}, {q(random.choice(avatares))}, {q(tipo)}, {q(f'avatares/{id_}')}, {q(f'Ativo {i + 1}')}, "
            f"{q(mime)}, {random.randint(50_000, 40_000_000)}, {q(quando(agora))});"
        )

    for i in range(TOKENS):
        usado = quando(agora, 20) if random.random() < 0.7 else None
        sql.append(
            "INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, last_used_at) VALUES "
            f"({q(uid())}, {dono()}, {q(f'Agente {i + 1}')}, {q(uuid.uuid4().hex)}, {q(quando(agora))}, {q(usado)});"
        )
    return sql


def main() -> None:
    agora = datetime.datetime.now(datetime.timezone.utc)
    sql = limpar() + ([] if "--limpar" in sys.argv else popular(agora))
    arquivo = Path(tempfile.mkdtemp(prefix="exemplos-painel-")) / "dados.sql"
    arquivo.write_text("\n".join(sql), encoding="utf-8")
    subprocess.run(["npx", "wrangler", "d1", "execute", "meu-avatar", "--local", f"--file={arquivo}"], check=True, stdin=subprocess.DEVNULL)
    print("Dados de exemplo removidos." if "--limpar" in sys.argv else f"{len(sql)} comandos no banco local. Abra http://localhost:8787/painel?periodo=tudo")


if __name__ == "__main__":
    main()
