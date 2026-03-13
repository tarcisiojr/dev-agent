## Context

O dev-agent é um servidor HTTP (Node.js) que recebe webhooks do GitHub/GitLab e executa um pipeline SDD via Claude Code CLI. Hoje só processa issues com label `ai-fix`. O server.js já possui infraestrutura de fila sequencial, job store (JSON), retry, validação de plataforma/usuário e spawn do Claude. O objetivo é estender essa infraestrutura para suportar jobs de code review em PRs/MRs, disparados pela label `ai-review`.

O Claude roda em container Docker com tools restritas (`Read,Glob,Grep,Bash`). Para review, ele não escreve código — apenas analisa e retorna um JSON estruturado com inline comments. O server parseia esse JSON e posta os comments via API da plataforma.

## Goals / Non-Goals

**Goals:**
- Suportar eventos de PR/MR no webhook existente (`/webhook`)
- Executar review automatizado do diff com análise de impacto em consumidores
- Considerar comentários existentes no PR para não repetir problemas já discutidos
- Postar inline review comments (por arquivo/linha) via API GitHub/GitLab
- Emitir veredito (`APPROVE` ou `REQUEST_CHANGES`)
- Reutilizar fila, jobs, retry e validação existentes

**Non-Goals:**
- Modificar o pipeline SDD existente (`ai-fix`)
- Self-review automático de PRs gerados pelo agente
- Review de commits individuais (só o diff total contra base)
- Sugestão de código (code suggestions) — apenas comentários descritivos
- Inline comments com `suggestion` blocks do GitHub

## Decisions

### 1. Tipo de job separado (`review`) na mesma fila

O job de review será enfileirado na mesma fila sequencial existente, mas com `type: 'review'`. O `executeJob` despacha para `executeReviewJob` quando `job.type === 'review'`. Isso evita criar infraestrutura paralela e mantém a garantia de processamento sequencial.

**Alternativa descartada:** Fila separada — adicionaria complexidade sem benefício real, já que o processamento sequencial é desejável (evita sobrecarga do Claude).

### 2. Output JSON estruturado do Claude (Opção A)

O Claude retorna um JSON com `verdict`, `summary` e `comments[]`. O server parseia e posta via API. Isso dá controle total ao server sobre o formato dos comments e permite validação antes de postar.

**Formato esperado:**
```json
{
  "verdict": "REQUEST_CHANGES",
  "summary": "Encontrados 2 problemas de segurança e 1 breaking change",
  "comments": [
    {
      "path": "src/auth.js",
      "line": 42,
      "severity": "high",
      "category": "breaking_change",
      "body": "Contrato alterado: assinatura mudou de (id) para (id, options). 3 chamadores afetados."
    }
  ]
}
```

**Alternativa descartada:** Claude posta direto via `curl`/`gh api` — menos confiável, difícil de tratar erros e retry.

### 3. Prompt recebe diff + comentários existentes como contexto

O server busca o diff (`git diff main...HEAD`) e os comentários existentes do PR via API **antes** de spawnar o Claude. Esses dados são injetados no prompt como contexto. O Claude recebe:
- O diff completo
- Lista de comentários existentes com autor e conteúdo
- Acesso ao repositório clonado para ler arquivos completos e buscar consumidores

**Alternativa descartada:** Claude busca comentários via API ele mesmo — exigiria tool `Bash` com `curl` autenticado e seria menos previsível.

### 4. Tools restritas para review: `Read,Glob,Grep,Bash`

O Claude de review precisa de `Bash` para executar `git diff` e comandos de busca. Mas **não precisa** de `Write` nem `Edit` — ele só analisa, não modifica código. O `Bash` é necessário para `git log`, `git diff --name-only` e outros comandos git.

### 5. Postagem de comments via API nativa (não CLI)

- **GitHub:** `POST /repos/{owner}/{repo}/pulls/{number}/reviews` com body contendo `event` (`APPROVE`/`REQUEST_CHANGES`) e `comments[]` com `path`, `line` (posição no diff), `body`
- **GitLab:** `POST /projects/{id}/merge_requests/{iid}/discussions` para cada comment, com `position` contendo `position_type`, `new_path`, `new_line`

A diferença principal: GitHub permite postar todos os comments em uma única request (como um review). GitLab exige uma request por discussion/comment.

### 6. Busca de comentários existentes para contexto

- **GitHub:** `GET /repos/{owner}/{repo}/pulls/{number}/comments` retorna todos os review comments
- **GitLab:** `GET /projects/{id}/merge_requests/{iid}/discussions` retorna todas as discussions

O server formata como texto legível e injeta no prompt do Claude com instrução de não repetir problemas já cobertos.

### 7. Detecção de eventos PR/MR no webhook handler

O `handleWebhook` ganha um segundo branch: após verificar se é issue event, verifica se é PR event. A lógica de label e autorização é reaproveitada, apenas adaptada para o payload de PR/MR.

- **GitHub:** header `x-github-event: pull_request`, action `labeled`, label `ai-review`
- **GitLab:** `object_kind: merge_request`, changes.labels com `ai-review` adicionada

## Risks / Trade-offs

**[Tamanho do diff] →** Diffs muito grandes podem exceder o contexto do Claude. Mitigação: truncar o diff em um limite razoável (ex: 500KB) e avisar no comment do PR que o review foi parcial.

**[Posição da linha no diff] →** A API do GitHub usa a posição relativa ao diff (não o número da linha absoluto). Pode haver mismatch se o Claude retornar linha absoluta. Mitigação: o prompt instrui o Claude a usar o número da linha no arquivo modificado (new file line number), e o server converte para a posição no diff ao postar no GitHub.

**[Rate limiting de API] →** Muitos comments em um PR grande podem sofrer rate limit. Mitigação: GitHub aceita batch (um review com N comments). GitLab exige uma request por comment — adicionar delay entre requests se necessário.

**[Re-trigger] →** O dev remove e re-adiciona a label para pedir novo review. O webhook de "labeled" será disparado normalmente. Nenhuma lógica especial necessária — a leitura de comentários existentes já resolve o problema de repetição.

**[JSON mal formado] →** O Claude pode retornar JSON inválido. Mitigação: tentar parsear, se falhar, fazer retry (até maxRetries). Se persistir, comentar na PR que o review falhou.
