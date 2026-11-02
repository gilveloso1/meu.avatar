#!/bin/sh
# Monta a imagem de render, confere um render sem rede e a manda ao registro da Cloudflare.
# Precisa do Docker (no ambiente cloud: `dockerd &`). Uso: ./construir.sh <versão>, e depois
# ponha a imagem que ele imprime no "image" do Renderer em wrangler.jsonc (docs/operacao.md).
# A conta vem de CLOUDFLARE_ACCOUNT_ID, do wrangler.jsonc ou do `wrangler whoami`.
set -eu
cd "$(dirname "$0")"
VERSAO=${1:?Diga a versão, como 1}
NOME=meu-avatar-render:$VERSAO
sh ./baixar.sh

# No ambiente cloud, o apt e o npm só passam pelo proxy com a CA dele, como segredo do build.
CA=/root/.ccr/ca-bundle.crt
if [ -f "$CA" ]; then
  docker build --network host --secret id=ca,src="$CA" --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" -t "$NOME" .
else
  docker build -t "$NOME" .
fi

# Sem rede, como na Cloudflare: o exemplo precisa sair com transparência.
docker rm -f render-teste >/dev/null 2>&1 || true
docker run -d --name render-teste --network none --cpus 2 --memory 8g "$NOME" >/dev/null
trap 'docker rm -f render-teste >/dev/null 2>&1 || true' EXIT
T=$(mktemp -d)
for i in $(seq 1 30); do docker exec render-teste node -e 'fetch("http://127.0.0.1:8080/saude").then(r=>process.exit(r.ok?0:1),()=>process.exit(1))' && break; sleep 1; done
docker cp exemplo.html render-teste:/tmp/exemplo.html
docker exec render-teste sh -c 'node -e "
const fs=require(\"fs\");
fetch(\"http://127.0.0.1:8080/render\",{method:\"POST\",headers:{\"x-largura\":\"720\",\"x-altura\":\"1280\",\"x-duracao\":\"3\"},body:fs.readFileSync(\"/tmp/exemplo.html\")})
 .then(async r=>{if(!r.ok){console.error(await r.text());process.exit(1)}fs.writeFileSync(\"/tmp/saida.webm\",Buffer.from(await r.arrayBuffer()))})"'
docker cp render-teste:/tmp/saida.webm "$T/saida.webm"
./ffprobe -v error -show_entries stream_tags=alpha_mode -of default=nw=1 "$T/saida.webm" | grep -qi "alpha_mode=1" || { echo "O render saiu sem transparência." >&2; exit 1; }
echo "Render sem rede: ok ($(wc -c < "$T/saida.webm") bytes)."
# O "dormir" da Cloudflare só manda SIGTERM: tem de parar na hora, com código 0.
docker stop -t 5 render-teste >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' render-teste)" = 0 ] || { echo "O servidor não saiu no SIGTERM." >&2; exit 1; }

# Com a versão em número, o wrangler lê "meu-avatar-render:1" como host:porta, acha que é outro
# registro e manda ao Docker Hub. Então a imagem leva o endereço inteiro da Cloudflare.
# A conta: CLOUDFLARE_ACCOUNT_ID, senão a do "image" do Renderer em wrangler.jsonc, senão o whoami.
CONTA=${CLOUDFLARE_ACCOUNT_ID:-}
[ -n "$CONTA" ] || CONTA=$(grep -o 'registry\.cloudflare\.com/[0-9a-f]\{32\}/meu-avatar-render' ../../wrangler.jsonc | head -n 1 | cut -d/ -f2 || true)
[ -n "$CONTA" ] || CONTA=$(npx wrangler whoami < /dev/null 2>/dev/null | grep -o '[0-9a-f]\{32\}' | head -n 1 || true)
[ -n "$CONTA" ] || { echo "Não achei a conta da Cloudflare: defina CLOUDFLARE_ACCOUNT_ID." >&2; exit 1; }
ENDERECO=registry.cloudflare.com/$CONTA/$NOME
docker tag "$NOME" "$ENDERECO"
# O registro às vezes responde "blob unknown to registry" depois de subir as camadas; na segunda vai.
npx wrangler containers push "$ENDERECO" < /dev/null || {
  echo "O envio falhou; tentando de novo." >&2
  npx wrangler containers push "$ENDERECO" < /dev/null || { echo "O envio falhou de novo." >&2; exit 1; }
}
echo "Imagem: $ENDERECO"
