## Why

Hoje o dev-agent executa issues com um prompt simples e sem persistência de estado. Se o container morrer, o job em execução se perde e a fila in-memory some. Além disso, o Claude recebe um prompt raso que não o guia através de um raciocínio estruturado, resultando em implementações menos consistentes. Adotar SDD (Spec-Driven Development) como pipeline de execução resolve ambos os problemas: cada fase produz um artefato que serve como checkpoint para resiliência e como contexto para qualidade.

## What Changes

- Substituir o prompt único por um pipeline de 4 fases (requirements → design → tasks → implementation), cada uma com seu próprio spawn do Claude
- Persistir estado dos jobs em `jobs.json` no volume `/workspace`, permitindo retomada após crash/restart
- Implementar monitor de jobs que na inicialização re-enfileira jobs interrompidos, retomando da última fase completa
- Na fase de implementation, usar o `TASKS.md` com checkboxes como checkpoint por task, permitindo retry granular
- Comentar progresso na issue a cada transição de fase e a cada task concluída
- Retry automático (max 3 por fase) com fallback para comentário pedindo ajuda humana
- Artefatos SDD ficam em `docs/specs/` no worktree e vão pro PR como documentação

## Capabilities

### New Capabilities
- `job-persistence`: Persistência de estado dos jobs em `jobs.json` com status, fase atual, contagem de retries e timestamps
- `sdd-pipeline`: Pipeline de execução em 4 fases (requirements, design, tasks, implementation) com prompts especializados por fase
- `job-monitor`: Monitor que detecta jobs interrompidos na inicialização e durante execução, com retry automático da última fase completa
- `progress-reporter`: Comentários de progresso na issue a cada transição de fase e conclusão de task

### Modified Capabilities

## Impact

- `automation/server.js`: refatoração significativa — `executeJob()` vira pipeline de fases, nova lógica de persistência e monitor
- `automation/CLAUDE.md`: atualizar para refletir que artefatos SDD são gerados e que o agente deve seguir o TASKS.md
- Volume `workspace`: passa a conter `/workspace/jobs.json` além dos repos e worktrees existentes
- CLAUDE.md de repos alvo: respeitado naturalmente (está no cwd do worktree)
