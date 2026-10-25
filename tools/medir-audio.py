#!/usr/bin/env python3
"""Mede o áudio de um ou mais vídeos, do jeito usado para comparar os modelos
(docs/prompt.md e docs/backlog.md):

- loudness integrada (LUFS) e pico real (dBFS), pelo ebur128 do ffmpeg;
- clipping: % de amostras com |x| >= 0,99;
- tom mediano da voz (F0, Hz);
- energia acima de 3 kHz (% do total), que acompanha o "agudo/chiado".

Uso: python3 tools/medir-audio.py video1.mp4 [video2.mp4 ...]
Precisa de ffmpeg e numpy. Referência (Higgsfield, Wan 3.0, 480p): −13,8 LUFS,
pico −0,3 dBFS, clipping 0,15%, acima de 3 kHz 1,7%.
"""
import re
import subprocess
import sys

import numpy as np

SR = 22050


def loudness(path):
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    summary = out[out.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    p = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary)
    return (float(i.group(1)) if i else None, float(p.group(1)) if p else None)


def samples(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def pitch(x):
    f0, w = [], 1024
    for i in range(0, len(x) - w, w // 2):
        seg = x[i:i + w] * np.hanning(w)
        if np.sqrt((seg ** 2).mean()) < 0.05:
            continue
        ac = np.correlate(seg, seg, "full")[w - 1:]
        lo, hi = SR // 400, SR // 70
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.4 * ac[0]:
            f0.append(SR / k)
    return float(np.median(f0)) if f0 else None


def high_share(x):
    spec = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return float(spec[f >= 3000].sum() / spec.sum() * 100)


print(f"{'vídeo':40} {'LUFS':>6} {'pico':>6} {'clipping':>9} {'F0 Hz':>6} {'>3 kHz':>7}")
for path in sys.argv[1:]:
    lufs, peak = loudness(path)
    x = samples(path)
    clip = float((np.abs(x) >= 0.99).mean() * 100)
    f0 = pitch(x)
    print(f"{path[-40:]:40} {lufs if lufs is not None else '?':>6} {peak if peak is not None else '?':>6} "
          f"{clip:8.2f}% {f0 or 0:6.0f} {high_share(x):6.1f}%")
