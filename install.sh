#!/bin/bash
# Instalação do Dev Agent em uma nova VM
# Uso: curl -fsSL <url>/install.sh | bash
#   ou: ./install.sh
#
# Requisitos: Debian/Ubuntu com acesso root
set -e

INSTALL_DIR="/opt/dev-agent"
REPO_URL="https://github.com/tarcisiojr/dev-agent.git"
LOG_FILE="/var/log/dev-agent-deploy.log"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --- Verificações ---

if [ "$(id -u)" -ne 0 ]; then
  error "Execute como root: sudo ./install.sh"
fi

echo ""
echo "════════════════════════════════════════"
echo "  Dev Agent — Instalação Automatizada"
echo "════════════════════════════════════════"
echo ""

# --- 1. Instalar dependências do sistema ---

info "Instalando dependências do sistema..."
apt-get update -qq > /dev/null
apt-get install -y -qq git curl cron > /dev/null 2>&1
info "git, curl, cron instalados"

# --- 2. Instalar Docker (se não estiver instalado) ---

if command -v docker &> /dev/null; then
  info "Docker já instalado: $(docker --version | cut -d' ' -f3)"
else
  info "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh > /dev/null 2>&1
  systemctl enable docker
  systemctl start docker
  info "Docker instalado: $(docker --version | cut -d' ' -f3)"
fi

# Verificar docker compose
if docker compose version &> /dev/null; then
  info "Docker Compose disponível: $(docker compose version --short)"
else
  error "Docker Compose não encontrado. Instale o plugin docker-compose-plugin."
fi

# --- 3. Clonar repositório ---

if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Repositório já existe em $INSTALL_DIR — atualizando..."
  cd "$INSTALL_DIR"
  git pull --ff-only origin main
else
  info "Clonando repositório em $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

info "Repositório pronto em $INSTALL_DIR"

# --- 4. Configurar .env ---

if [ -f "$INSTALL_DIR/.env" ]; then
  warn "Arquivo .env já existe — mantendo configuração atual"
else
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  warn "Arquivo .env criado a partir do .env.example"
  echo ""
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║  Configure as variáveis de ambiente em:          ║"
  echo "  ║  $INSTALL_DIR/.env                               ║"
  echo "  ║                                                  ║"
  echo "  ║  Variáveis obrigatórias:                         ║"
  echo "  ║  - CLAUDE_CODE_OAUTH_TOKEN (autenticação Claude) ║"
  echo "  ║  - ALLOWED_USERS (usuários autorizados)          ║"
  echo "  ║  - TS_AUTHKEY (Tailscale Funnel)                 ║"
  echo "  ║                                                  ║"
  echo "  ║  Para GitHub:                                    ║"
  echo "  ║  - GITHUB_TOKEN                                  ║"
  echo "  ║  - GITHUB_WEBHOOK_SECRET                         ║"
  echo "  ║                                                  ║"
  echo "  ║  Para GitLab:                                    ║"
  echo "  ║  - GITLAB_TOKEN                                  ║"
  echo "  ║  - GITLAB_SECRET                                 ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo ""

  read -p "Deseja editar o .env agora? [s/N] " edit_env
  if [[ "$edit_env" =~ ^[sS]$ ]]; then
    ${EDITOR:-nano} "$INSTALL_DIR/.env"
  fi
fi

# --- 5. Configurar auto-deploy via cron ---

chmod +x "$INSTALL_DIR/auto-deploy.sh"
CRON_LINE="* * * * * $INSTALL_DIR/auto-deploy.sh"

if crontab -l 2>/dev/null | grep -qF "$INSTALL_DIR/auto-deploy.sh"; then
  info "Cron de auto-deploy já configurado"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  systemctl enable cron
  systemctl start cron
  info "Cron de auto-deploy configurado (verifica a cada 1 minuto)"
fi

# --- 6. Criar arquivo de log ---

touch "$LOG_FILE"
info "Log de deploy em $LOG_FILE"

# --- 7. Iniciar serviços ---

echo ""
read -p "Iniciar os serviços agora? [S/n] " start_services
if [[ ! "$start_services" =~ ^[nN]$ ]]; then
  info "Construindo e iniciando containers..."
  cd "$INSTALL_DIR"
  docker compose up -d --build
  echo ""
  info "Serviços iniciados!"
  docker compose ps
else
  warn "Serviços não iniciados. Para iniciar manualmente:"
  echo "  cd $INSTALL_DIR && docker compose up -d --build"
fi

# --- Resumo ---

echo ""
echo "════════════════════════════════════════"
echo "  Instalação concluída!"
echo "════════════════════════════════════════"
echo ""
echo "  Diretório:    $INSTALL_DIR"
echo "  Auto-deploy:  cron a cada 1 minuto"
echo "  Log:          $LOG_FILE"
echo ""
echo "  Comandos úteis:"
echo "  - Ver logs:     docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "  - Restart:      docker compose -f $INSTALL_DIR/docker-compose.yml restart automation"
echo "  - Status:       docker compose -f $INSTALL_DIR/docker-compose.yml ps"
echo "  - Deploy log:   tail -f $LOG_FILE"
echo ""
