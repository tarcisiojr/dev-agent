FROM node:22-alpine

# Instalar dependências do sistema
RUN apk add --no-cache git bash curl

# Instalar glab (GitLab CLI)
RUN GLAB_VERSION=$(curl -fsSL "https://gitlab.com/api/v4/projects/34675721/releases" | sed -n 's/.*"tag_name":"v\([^"]*\)".*/\1/p' | head -1) && \
    curl -fsSL "https://gitlab.com/gitlab-org/cli/-/releases/v${GLAB_VERSION}/downloads/glab_${GLAB_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=1 bin/glab

# Instalar gh (GitHub CLI)
RUN GH_VERSION=$(curl -fsSL "https://api.github.com/repos/cli/cli/releases/latest" | sed -n 's/.*"tag_name":"v\([^"]*\)".*/\1/p') && \
    curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=1 "gh_${GH_VERSION}_linux_amd64/bin/gh"

# Instalar Claude Code CLI globalmente
RUN npm install -g @anthropic-ai/claude-code

# Configurar git
RUN git config --global user.email "claude@homelab" && \
    git config --global user.name "Claude Code"

WORKDIR /workspace

COPY . /app

CMD ["node", "/app/server.js"]
