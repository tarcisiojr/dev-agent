#!/bin/bash
# Auto-deploy: verifica atualizações no remote e reconstrói apenas quando necessário
# Uso: adicionar ao crontab com: * * * * * /opt/dev-agent/auto-deploy.sh
set -e

# Diretório do repositório (ajuste se necessário)
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/var/log/dev-agent-deploy.log"
LOCK_FILE="/tmp/dev-agent-deploy.lock"

# Evitar execuções concorrentes
if [ -f "$LOCK_FILE" ]; then
  exit 0
fi
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

cd "$REPO_DIR"

git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")

echo "[$(date -Iseconds)] Atualização detectada: $LOCAL -> $REMOTE" >> "$LOG_FILE"
echo "[$(date -Iseconds)] Arquivos alterados: $(echo $CHANGED | tr '\n' ' ')" >> "$LOG_FILE"

git pull --ff-only origin main >> "$LOG_FILE" 2>&1

# Rebuild só se Dockerfile ou entrypoint mudaram (dependências/infra)
# Código JS já é montado via volume, não precisa de rebuild
if echo "$CHANGED" | grep -qE "^automation/(Dockerfile|entrypoint\.sh)"; then
  echo "[$(date -Iseconds)] Dockerfile/entrypoint alterado — rebuild do container" >> "$LOG_FILE"
  docker compose up -d --build automation >> "$LOG_FILE" 2>&1
elif echo "$CHANGED" | grep -q "^automation/"; then
  echo "[$(date -Iseconds)] Código alterado — restart do container (sem rebuild)" >> "$LOG_FILE"
  docker compose restart automation >> "$LOG_FILE" 2>&1
else
  echo "[$(date -Iseconds)] Sem mudanças em automation/ — apenas git pull" >> "$LOG_FILE"
fi

echo "[$(date -Iseconds)] Deploy concluído" >> "$LOG_FILE"
