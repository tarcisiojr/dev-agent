FROM node:22-alpine

# Instalar dependências do sistema
RUN apk add --no-cache git bash curl

# Instalar glab (GitLab CLI)
RUN curl -fsSL https://gitlab.com/gitlab-org/cli/-/releases/permalink/latest/downloads/glab_linux_amd64.tar.gz \
    | tar -xz -C /usr/local/bin --strip-components=1 bin/glab

# Instalar gh (GitHub CLI)
RUN curl -fsSL https://github.com/cli/cli/releases/latest/download/gh_2.67.0_linux_amd64.tar.gz \
    | tar -xz -C /usr/local/bin --strip-components=1 gh_2.67.0_linux_amd64/bin/gh

# Instalar Claude Code CLI globalmente
RUN npm install -g @anthropic-ai/claude-code

# Configurar git
RUN git config --global user.email "claude@homelab" && \
    git config --global user.name "Claude Code"

WORKDIR /workspace

COPY . /app

CMD ["node", "/app/server.js"]
