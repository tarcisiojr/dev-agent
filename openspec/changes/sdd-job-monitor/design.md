## Context

O dev-agent atual (`automation/server.js`) processa issues via webhook, usando uma fila in-memory e um spawn único do Claude Code. Não há persistência de estado — se o container reinicia, jobs em andamento e enfileirados se perdem. O prompt enviado ao Claude é simples e não guia um raciocínio estruturado.

O volume `workspace` é um named volume Docker (persistente entre restarts). Já contém bare repos em `/workspace/repos/` e worktrees efêmeros em `/workspace/worktrees/`.

A fila é sequencial — uma issue por vez, sem concorrência.

## Goals / Non-Goals

**Goals:**
- Persistir estado dos jobs para sobreviver a crashes/restarts do container
- Retomar jobs interrompidos da última fase completa automaticamente
- Estruturar a execução em pipeline SDD de 4 fases com artefatos intermediários
- Dar visibilidade de progresso ao usuário via comentários na issue
- Retry automático com limite por fase

**Non-Goals:**
- Processamento paralelo de issues (fila continua sequencial)
- Classificação de complexidade (issues triviais vs complexas) — todas passam pelo pipeline completo
- Dashboard ou UI de monitoramento
- Notificações além de comentários na issue (Slack, email, etc.)

## Decisions

### 1. Persistência em JSON no volume workspace

Armazenar estado em `/workspace/jobs.json`. Um único arquivo JSON com todos os jobs.

**Alternativa descartada**: SQLite. Mais robusto, mas adiciona dependência e complexidade desnecessária para fila sequencial com volume baixo.

**Operações**: leitura na inicialização, escrita a cada transição de fase/task. Usar `fs.writeFileSync` com escrita atômica (write-to-temp + rename) para evitar corrupção.

### 2. Pipeline de 4 fases com spawn separado por fase

Cada fase é um spawn independente do Claude Code:
1. **requirements**: Gera `docs/specs/REQUIREMENTS.md`
2. **design**: Lê REQUIREMENTS.md, gera `docs/specs/DESIGN.md`
3. **tasks**: Lê ambos, gera `docs/specs/TASKS.md` (checklist `- [ ]`)
4. **implementation**: Lê todos os artefatos, implementa task por task

**Alternativa descartada**: Prompt único com todas as fases. Não permite checkpoint e retry granular. O Claude pode perder contexto em sessões longas.

**Cada spawn recebe**: um prompt específico da fase + referência aos artefatos anteriores (o Claude Code pode lê-los via Read tool já que estão no cwd).

### 3. Monitor de recovery na inicialização

Ao iniciar, o server.js:
1. Lê `jobs.json`
2. Jobs com status `running` → marca como `interrupted`, incrementa retryCount, re-enfileira
3. Jobs com status `queued` → re-enfileira
4. Jobs com status `failed` ou `done` → ignora

Não há heartbeat periódico durante execução — como a fila é sequencial, se o processo Node está vivo, o job está vivo. Se o processo morre, o recovery acontece no próximo start.

**Alternativa descartada**: Heartbeat com processo separado. Overkill para fila sequencial — se o processo Node morre, o container reinicia (restart: unless-stopped) e o recovery na inicialização cuida do resto.

### 4. Retry automático com limite de 3 tentativas por fase

Cada fase tem até 3 tentativas. O retryCount é por fase (resetado ao avançar de fase).

Se esgotar retries numa fase:
- Status do job → `needs_help`
- Comenta na issue pedindo intervenção humana
- Job não é mais retentado automaticamente

### 5. Artefatos SDD no diretório docs/specs/ do worktree

Os artefatos ficam em `docs/specs/` dentro do worktree. Isso significa que:
- Vão para o PR como documentação do raciocínio
- O Claude Code os lê naturalmente nas fases seguintes (estão no cwd)
- Servem como checkpoint — se existem, a fase foi completada

### 6. Prompts especializados por fase

Cada fase tem um builder de prompt dedicado que inclui:
- Contexto da issue (título, descrição)
- Instrução específica da fase
- Referência aos artefatos anteriores
- Regra de autonomia (não pedir input, tomar decisões sozinho)
- Instrução para respeitar CLAUDE.md do repo se existir

### 7. Comentários de progresso na issue

Padrão de comentários:
- Início: `🤖 Analisando issue...`
- Fase 1 concluída: `📋 Requisitos definidos`
- Fase 2 concluída: `🏗️ Design definido`
- Fase 3 concluída: `📝 N tarefas identificadas`
- Cada task da fase 4: `⚙️ Implementando task N/M: <descrição>`
- Conclusão: `✅ PR criado` ou `❌ Falha` ou `⏱️ Timeout`
- Needs help: `🆘 Preciso de ajuda humana após N tentativas`

## Risks / Trade-offs

- **[Custo maior por issue]** → 4 spawns do Claude em vez de 1. Aceitável pelo ganho em qualidade e resiliência. Issues simples ainda passam pelo pipeline completo.
- **[Corrupção do jobs.json]** → Mitigado com escrita atômica (write-temp + rename). Se corrompido, tratar como arquivo vazio (jobs perdidos são re-triggerados manualmente).
- **[Artefatos SDD poluem o PR]** → Ficam em `docs/specs/`, isolados do código. Revisor pode ignorar ou usar como documentação do raciocínio.
- **[Claude pode gerar TASKS.md mal formatado]** → O parser de tasks deve ser tolerante (regex para `- [ ]` e `- [x]`).
- **[Retry infinito em issue irresolvível]** → Limitado a 3 tentativas por fase, com fallback para comentário pedindo ajuda humana.
