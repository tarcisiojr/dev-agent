FROM node:22-alpine

# Instalar dependências do sistema
RUN apk add --no-cache git bash curl su-exec

# Instalar glab (GitLab CLI)
RUN GLAB_VERSION=$(curl -fsSL "https://gitlab.com/api/v4/projects/34675721/releases" | sed -n 's/.*"tag_name":"v\([^"]*\)".*/\1/p' | head -1) && \
    curl -fsSL "https://gitlab.com/gitlab-org/cli/-/releases/v${GLAB_VERSION}/downloads/glab_${GLAB_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=1 bin/glab

# Instalar gh (GitHub CLI)
ARG GH_VERSION=2.67.0
RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=1 "gh_${GH_VERSION}_linux_amd64/bin/gh"

# Instalar Claude Code CLI globalmente
RUN npm install -g @anthropic-ai/claude-code

# Criar usuário não-root (Claude Code bloqueia --dangerously-skip-permissions como root)
RUN addgroup -S agent && adduser -S agent -G agent

# Configurar git
RUN git config --system user.email "claude@homelab" && \
    git config --system user.name "Claude Code"

# Criar diretórios com permissão para o usuário agent
RUN mkdir -p /workspace /home/agent/.claude && \
    chown -R agent:agent /workspace /home/agent

WORKDIR /workspace

COPY . /app
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
