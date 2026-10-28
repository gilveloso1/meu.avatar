"""
Vídeos de exemplo no banco e no R2 LOCAIS (wrangler dev), para ver as listas e a
página do vídeo sem gerar nada no OpenRouter. Nunca mexe no remoto.

Uso: npm run exemplos   (precisa do ffmpeg; rode antes o npm run db:migrar:local
e crie a conta em http://localhost:8787, que vira o user_id 1)

São 8 vídeos do HeyGen e 3 do Wan, em 9:16 e 16:9, prontos, na fila e com falha.
Os prontos são clipes curtos de degradê com um tom: servem para as miniaturas e o
player, não para a edição rápida (não há pausas na fala).
"""

from __future__ import annotations

import datetime
import json
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

FALAS = [
    "Oi! Eu sou a Ana e aqui você vai encontrar receitas rápidas para o dia a dia.",
    "Só hoje: tênis de corrida com 30% de desconto. Corre que é por tempo limitado!",
    "Hoje tem live às 20h. Ative o lembrete e venha conversar comigo.",
    "Três dicas para economizar na conta de luz sem perder o conforto.",
    "Você sabia que beber água logo cedo ajuda a acordar o corpo?",
    "Chegou a nova coleção de outono. Peças leves, cores quentes e preço justo.",
    "Quer aprender inglês em 15 minutos por dia? Eu te mostro como.",
    "Obrigado pelos 10 mil seguidores! Vem aí um sorteio especial.",
    "Promoção relâmpago na loja: frete grátis para todo o Brasil.",
    "Bom dia! Hoje vamos falar sobre investimentos para iniciantes.",
    "Conheça o nosso novo app: agende consultas em dois toques.",
]
CORES = [
    ("0x6750A4", "0xF2B8B5"), ("0x006A6A", "0xA0F0E8"), ("0x8B5000", "0xFFDCBE"), ("0x3A5BA0", "0xD8E2FF"),
    ("0x7D5260", "0xFFD8E4"), ("0x4A6741", "0xCBEBC0"), ("0x5B5F97", "0xE0E0FF"), ("0x9C4146", "0xFFDAD9"),
    ("0x2F5F8A", "0xCDE5FF"), ("0x6F5B40", "0xF5E0BB"), ("0x4E6355", "0xD0E8D6"),
]
# (estrutura, status, duração em s)
PLANO = [
    ("heygen", "completed", 8), ("heygen", "completed", 12), ("heygen", "in_progress", 6), ("heygen", "completed", 10),
    ("heygen", "failed", 7), ("heygen", "completed", 15), ("heygen", "completed", 9), ("heygen", "completed", 11),
    ("wan", "completed", 25), ("wan", "pending", 25), ("wan", "completed", 25),
]


def sql_text(value: str | None) -> str:
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def main() -> None:
    if not shutil.which("ffmpeg"):
        sys.exit("Falta o ffmpeg (brew install ffmpeg).")
    work = Path(tempfile.mkdtemp(prefix="exemplos-"))
    now = datetime.datetime.now(datetime.timezone.utc)
    rows, uploads = [], []
    for i, (structure, status, duration) in enumerate(PLANO):
        vid = str(uuid.uuid4())
        ratio = "16:9" if i % 4 == 3 else "9:16"
        size = "640x360" if ratio == "16:9" else "360x640"
        created = (now - datetime.timedelta(hours=i * 7 + 1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        key = None
        if status == "completed":
            clip = work / f"{vid}.mp4"
            c0, c1 = CORES[i]
            seconds = str(min(duration, 6))
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error",
                 "-f", "lavfi", "-i", f"gradients=s={size}:c0={c0}:c1={c1}:duration={seconds}:speed=0.02",
                 "-f", "lavfi", "-i", f"sine=frequency={300 + i * 40}:duration={seconds}",
                 "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(clip)],
                check=True,
            )
            key = f"videos/{vid}.mp4"
            uploads.append((key, clip))
        heygen = structure == "heygen"
        settings = json.dumps({"voice": "Kore · feminina · multilíngue", "expressiveness": "low"}) if heygen else "{}"
        rows.append(
            "INSERT INTO videos (id, job_id, status, prompt, model, duration, resolution, aspect_ratio, video_key, cost, error,"
            " created_at, updated_at, user_id, structure, settings, language, style) VALUES ("
            + ", ".join([
                sql_text(vid), sql_text(f"exemplo-{vid[:8]}"), sql_text(status), sql_text(FALAS[i]),
                sql_text("heygen/avatar-iv" if heygen else "alibaba/wan-3.0"), str(duration), "'720p'", sql_text(ratio),
                sql_text(key), str(round(duration * 0.05, 2) if heygen else 1.25),
                sql_text("O modelo recusou a foto: rosto não encontrado." if status == "failed" else None),
                sql_text(created), sql_text(created), "1", sql_text(structure), sql_text(settings),
                "null" if heygen else "'pt-BR'", "null" if heygen else "'selfie'",
            ])
            + ");"
        )
    seed = work / "exemplos.sql"
    seed.write_text("\n".join(rows) + "\n")
    wrangler = ["npx", "wrangler"]
    subprocess.run(wrangler + ["d1", "execute", "DB", "--local", "--file", str(seed)], check=True, stdin=subprocess.DEVNULL)
    for key, clip in uploads:
        subprocess.run(
            wrangler + ["r2", "object", "put", f"meu-avatar/{key}", "--file", str(clip), "--local", "--content-type", "video/mp4"],
            check=True, stdin=subprocess.DEVNULL,
        )
    shutil.rmtree(work)
    print(f"{len(rows)} vídeos de exemplo no banco local ({len(uploads)} com MP4).")


if __name__ == "__main__":
    main()
