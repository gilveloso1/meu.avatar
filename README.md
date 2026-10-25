# meu.avatar

Geração de vídeos curtos com avatar realista falando um texto, para redes sociais e anúncios, usando a API de vídeo do [OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation.md).

## Primeiro vídeo

Padrão do teste: `alibaba/wan-3.0`, 25 s, 480p, 9:16, com áudio (≈ US$ 0,05/s → US$ 1,25).

```sh
export OPENROUTER_API_KEY=...          # nunca commitar a chave
python3 gerar_video.py --prompt-arquivo prompts/teste.txt --imagem avatar.jpg --simular   # confere o pedido
python3 gerar_video.py --prompt-arquivo prompts/teste.txt --imagem avatar.jpg             # gera de verdade
```

- `--imagem` é opcional: arquivo local (enviado em base64) ou URL pública; vira o primeiro quadro do vídeo.
- O MP4 e um `.json` com o pedido/resposta ficam em `saida/`.
- Outras opções: `--modelo`, `--duracao`, `--resolucao`, `--formato`, `--seed` (veja `--help`).
