## ADDED Requirements

### Requirement: Container único de automação
O Dockerfile SHALL criar um container baseado em `node:22-alpine` com todas as ferramentas necessárias instaladas.

#### Scenario: Ferramentas instaladas
- **WHEN** o container é construído
- **THEN** o container MUST ter: `git`, `bash`, `curl`, `glab` (GitLab CLI), `gh` (GitHub CLI), `@anthropic-ai/claude-code` (npm global)

#### Scenario: Configuração do git
- **WHEN** o container é construído
- **THEN** o git MUST estar configurado com `user.email = claude@homelab` e `user.name = Claude Code`

#### Scenario: Diretório de trabalho
- **WHEN** o container inicia
- **THEN** o WORKDIR MUST ser `/workspace`

### Requirement: Docker Compose com 2 serviços
O docker-compose.yml SHALL definir dois serviços: `automation` e `tailscale`.

#### Scenario: Serviço automation
- **WHEN** o docker-compose sobe
- **THEN** o serviço `automation` MUST: construir a partir de `./automation/Dockerfile`, expor porta 9000, montar `./automation:/app`, montar volume `workspace:/workspace` e volume `claude-auth:/root/.claude`, receber variáveis de ambiente via `.env`

#### Scenario: Serviço tailscale
- **WHEN** o docker-compose sobe
- **THEN** o serviço `tailscale` MUST: usar imagem `tailscale/tailscale:latest`, montar volume para estado, montar `./tailscale-config:/config`, ter capabilities `NET_ADMIN` e `SYS_MODULE`, receber `TS_AUTHKEY` e `TS_SERVE_CONFIG`

#### Scenario: Restart policy
- **WHEN** um container falha
- **THEN** ambos os serviços MUST ter `restart: unless-stopped`

### Requirement: Tailscale Funnel
O arquivo `tailscale-config/funnel.json` SHALL configurar o Tailscale Funnel para expor a porta 9000 via HTTPS na porta 443.

#### Scenario: Exposição pública
- **WHEN** o Tailscale Funnel está ativo
- **THEN** requisições HTTPS na porta 443 do domínio Tailscale MUST ser redirecionadas para `automation:9000`

### Requirement: Arquivo .env.example
O projeto SHALL incluir um `.env.example` com todas as variáveis necessárias documentadas.

#### Scenario: Variáveis presentes
- **WHEN** o arquivo `.env.example` é consultado
- **THEN** MUST conter: `TS_AUTHKEY`, `GITLAB_SECRET`, `GITLAB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `ALLOWED_USERS`

### Requirement: CLAUDE.md de contexto
O projeto SHALL incluir um `CLAUDE.md` na pasta `automation/` com instruções para o Claude Code operar de forma autônoma.

#### Scenario: Instruções presentes
- **WHEN** o Claude Code lê o `CLAUDE.md`
- **THEN** o arquivo MUST conter: comportamento autônomo (nunca parar esperando input), padrões de branch e commit, como rodar testes, como abrir MR/PR via glab ou gh, variáveis de ambiente disponíveis

### Requirement: Arquivo .gitignore
O projeto SHALL incluir um `.gitignore` que exclui arquivos sensíveis e temporários.

#### Scenario: Arquivos excluídos
- **WHEN** o `.gitignore` é aplicado
- **THEN** MUST excluir: `.env`, `tailscale-config/state/`, `node_modules/`, `workspace/`
