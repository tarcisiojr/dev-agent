# Design Técnico — Issue #3: Evitar Prompt Injection

## 1. Contexto e Estado Atual do Código

### Arquitetura do sistema

O `dev-agent` é um servidor HTTP Node.js (`automation/server.js`) que:

1. Recebe webhooks do GitHub/GitLab via `POST /webhook`
2. Valida assinatura/token do webhook
3. Extrai dados da issue/PR do payload
4. Enfileira um `job` para execução sequencial
5. Executa o pipeline SDD (5 fases) ou code review, instanciando o Claude Code via `spawn`
6. O conteúdo da issue (título, descrição) é interpolado diretamente nos prompts em `automation/prompts.js`

### Superfície de ataque atual

O fluxo atual não realiza nenhuma validação do conteúdo da issue. O caminho entre o webhook e o `spawnClaude(prompt, ...)` é:

```
webhook → handleWebhook → extractIssueData → enqueue → executeJob → runPhase → buildPrompt(job) → spawnClaude
```

Para review jobs:
```
webhook → handleWebhook → extractPullRequestData → enqueue → executeReviewJob → fetchPRDiff → fetchExistingComments → buildCodeReviewPrompt → spawnClaude
```

As variáveis `job.title`, `job.description`, `diff` e `existingComments` chegam ao Claude sem qualquer filtro.

### Arquivos relevantes

| Arquivo | Papel |
|---|---|
| `automation/server.js` | Servidor HTTP, pipeline de execução, ponto de integração principal |
| `automation/prompts.js` | Construtores de prompt — interpolam dados da issue |
| `automation/jobStore.js` | Persistência de jobs em `jobs.json` |

---

## 2. Abordagem Técnica Escolhida

### Estratégia: Detecção por regras regex antes da execução

A detecção será feita via **análise estática com expressões regulares** aplicada ao conteúdo da issue/PR antes de qualquer enfileiramento ou execução do Claude.

Essa abordagem foi escolhida por:
- Não requerer dependências externas (RNF-04)
- Execução em microsegundos, muito abaixo do limite de 100ms (RNF-01)
- Regras declarativas em estrutura de dados separada, fáceis de manter (RNF-03)
- Controle total sobre os padrões, permitindo calibrar a taxa de falsos positivos (RNF-02)

### Dois pontos de verificação

A verificação acontece em dois momentos distintos:

**Ponto 1 — No webhook handler (antes de enfileirar):**
- Para issue jobs: verifica `title` e `description`
- Para review jobs: verifica apenas o `title` do PR (diff ainda não está disponível)

**Ponto 2 — Dentro de `executeReviewJob` (antes de chamar o Claude):**
- Verifica o `diff` do PR (após clonar o repositório)
- Verifica os `existingComments` buscados via API

Essa separação é necessária porque o diff só está disponível após o clone do repositório, que ocorre dentro de `executeReviewJob`.

---

## 3. Componentes e Arquivos

### Novo arquivo: `automation/promptInjectionDetector.js`

Módulo isolado com toda a lógica de detecção. Exporta uma única função pública:

```js
detectPromptInjection(content: string): { detected: boolean, rule: string|null, match: string|null }
```

Internamente contém:
- `INJECTION_RULES`: array de objetos `{ name, pattern, description }` com todos os padrões regex
- Lógica de normalização (lowercase, remoção de zero-width chars)
- Truncamento do trecho detectado para log (máx. 200 chars)

### Modificação: `automation/server.js`

Dois pontos de modificação:

**1. `handleWebhook`** — após `extractIssueData` / `extractPullRequestData`, antes de `enqueue`:

```js
const fieldsToCheck = job.type === 'review'
  ? [{ field: 'title', value: job.title }]
  : [{ field: 'title', value: job.title }, { field: 'description', value: job.description }];

for (const { field, value } of fieldsToCheck) {
  const result = detectPromptInjection(value);
  if (result.detected) {
    // bloquear job, comentar, retornar
  }
}
```

**2. `executeReviewJob`** — após `fetchPRDiff` e `fetchExistingComments`, antes de `buildCodeReviewPrompt`:

```js
const reviewFieldsToCheck = [
  { field: 'diff', value: diff },
  { field: 'existingComments', value: existingComments },
];
for (const { field, value } of reviewFieldsToCheck) {
  if (!value) continue;
  const result = detectPromptInjection(value);
  if (result.detected) {
    // bloquear job, comentar, retornar
  }
}
```

**Nova função auxiliar: `blockJob(job, field, detectionResult, commentFn)`**

Centraliza a lógica de bloqueio:
1. Loga o evento de auditoria (`[security]`)
2. Define `job.status = 'blocked'` e adiciona `job.blockedReason`
3. Chama `upsertJob(job)`
4. Chama `commentFn(job, mensagem)` para notificar na issue/PR
5. Retorna para interromper execução

---

## 4. Modelos de Dados

### Campo `blockedReason` adicionado ao job

```js
{
  id: "github-owner-repo-42",
  status: "blocked",           // novo valor de status
  // ... campos existentes ...
  blockedReason: {
    field: "description",      // campo onde foi detectado
    rule: "override_instructions",  // nome da regra disparada
    match: "ignore all previous instructions and...", // trecho (truncado em 200 chars)
    detectedAt: "2026-03-13T10:00:00.000Z"
  }
}
```

O campo `status: 'blocked'` é um novo valor no enum de status do job. Os valores existentes são: `queued`, `running`, `done`, `needs_help`. Não há alteração no schema do `jobStore.js` — `upsertJob` aceita qualquer objeto.

---

## 5. Regras de Detecção

As regras são projetadas para ter **alta especificidade** (baixo falso positivo) ao exigir combinações características de tentativas de injeção, não apenas palavras isoladas.

### Grupo 1: Sobrescrita de instruções

| Nome | Padrão | Justificativa |
|---|---|---|
| `override_instructions` | `/(ignore\|disregard\|forget\|override)\s+(all\s+)?(the\s+)?(previous\|above\|prior\|earlier)\s+(instructions?\|rules?\|guidelines?\|context)/i` | Combinação imperativo + alvo — não dispara em "este artigo discute prompt injection" |
| `new_instructions` | `/\[new\s+instructions?\]\|new\s+system\s+prompt\|<\/?system>/i` | Delimitadores de contexto usados em ataques documentados |

### Grupo 2: Redefinição de papel

| Nome | Padrão | Justificativa |
|---|---|---|
| `role_redefinition` | `/(your\s+new\s+(role\|persona\|instructions?)\s+is\|pretend\s+you\s+are\s+(a\s+)?(?:hacker\|attacker\|malicious)\|from\s+now\s+on\s+you\s+(are\|will\|must))/i` | Exige contexto de redefinição explícita |

### Grupo 3: Exfiltração de dados sensíveis

| Nome | Padrão | Justificativa |
|---|---|---|
| `shell_exfiltration` | `/curl\s+https?:\/\/[^\s]+\s*\$\(\|wget\s+.*\$\(cat\s+\/etc\//i` | curl/wget com expansão de shell — indício de exfiltração |
| `sensitive_file_read` | `/\$\(cat\s+\/etc\/(passwd\|shadow\|hosts)\)\|`cat /etc/passwd`/i` | Leitura de arquivos sensíveis em contexto de substituição de comando |
| `token_exfiltration` | `/(exfiltr\|transmit\|send\|leak\|forward)\s+.*\b(GITHUB_TOKEN\|GITLAB_TOKEN\|API[_\s]?KEY\|secret\|password\|credential)/i` | Verbo de exfiltração + alvo sensível |
| `env_in_url` | `/https?:\/\/[^\s]*\$\{?(GITHUB_TOKEN\|GITLAB_TOKEN\|AWS_SECRET\|API_KEY)/i` | Token em URL — exfiltração via requisição HTTP |

### Lógica contra falsos positivos (CA-03)

Uma issue que diz *"esta funcionalidade tem uma vulnerabilidade de prompt injection"* não disparará nenhuma das regras acima porque:
- Não contém a combinação "ignore/disregard ... previous/above instructions"
- Não contém delimitadores de contexto
- Não contém comandos shell com expansão `$()`
- Não contém verbos de exfiltração + alvos sensíveis

---

## 6. Fluxo de Bloqueio

```
webhook recebido
  └── extractIssueData / extractPullRequestData
        └── detectPromptInjection(title)  ← Ponto 1
              └── [detected] → blockJob → commentOnIssue/PR → return 200
        └── detectPromptInjection(description)  ← Ponto 1
              └── [detected] → blockJob → commentOnIssue/PR → return 200
        └── [não detectado] → enqueue(job)

executeReviewJob
  └── fetchPRDiff
        └── detectPromptInjection(diff)  ← Ponto 2
              └── [detected] → blockJob → commentOnPR → return
  └── fetchExistingComments
        └── detectPromptInjection(existingComments)  ← Ponto 2
              └── [detected] → blockJob → commentOnPR → return
  └── buildCodeReviewPrompt → spawnClaude
```

### Mensagem de comentário no bloqueio

```
🚫 **Esta issue foi bloqueada** por suspeita de prompt injection.

O conteúdo da issue contém padrões que podem comprometer a segurança do agente.
Se você acredita que este é um falso positivo, entre em contato com um administrador.
```

### Log de auditoria (RF-05)

```
[security] [github/owner/repo#42] Prompt injection detectado — campo: description, regra: override_instructions, trecho: "ignore all previous instructions and..."
```

---

## 7. Decisões Técnicas e Alternativas Consideradas

### Decisão 1: Módulo separado vs. lógica inline em server.js

**Escolhido:** Módulo separado `promptInjectionDetector.js`

**Alternativa:** Adicionar a lógica diretamente em `server.js`

**Justificativa:** O módulo separado facilita testes unitários isolados, mantém `server.js` coeso, e atende ao RNF-03 (manutenibilidade dos padrões).

### Decisão 2: Verificação no webhook vs. antes do Claude

**Escolhido:** Ambos — webhook para título/descrição, `executeReviewJob` para diff/comments

**Alternativa:** Verificar apenas antes de `spawnClaude` (dentro de `runPhase`)

**Justificativa:** Verificar no webhook é mais seguro: o job nunca chega ao `jobStore` com status `queued` se for malicioso. Para diff e existing comments, não há escolha — só estão disponíveis dentro de `executeReviewJob`. Verificar só antes do Claude ainda enfileiraria o job malicioso, o que é indesejável.

### Decisão 3: Regex vs. análise semântica via Claude

**Escolhido:** Regex com regras declarativas

**Alternativa:** Chamar o Claude com um prompt de classificação antes de executar o prompt principal

**Justificativa:**
- RNF-04 proíbe dependências externas novas
- RNF-01 exige < 100ms — uma chamada ao Claude levaria segundos
- Regex é determinístico e auditável; o comportamento de um LLM classificador pode variar
- Custo adicional por request seria significativo

### Decisão 4: Bloqueio vs. sanitização

**Escolhido:** Bloqueio total (alinhado ao escopo definido nos requisitos)

**Alternativa:** Sanitizar o conteúdo e prosseguir

**Justificativa:** Sanitização introduz complexidade e risco de bypass. Bloqueio é uma resposta conservadora e segura. A issue explicitamente exclui sanitização do escopo.

---

## 8. Riscos e Trade-offs

### Risco 1: Falsos positivos em conteúdo técnico

**Probabilidade:** Baixa (com os padrões propostos)

**Impacto:** Issues legítimas bloqueadas sem motivo aparente

**Mitigação:** Padrões exigem combinação de múltiplos tokens característicos de injeção. A mensagem de bloqueio instrui o usuário a contactar um administrador. Padrões são configuráveis em `INJECTION_RULES`.

### Risco 2: Bypass via ofuscação

**Probabilidade:** Média

**Impacto:** Conteúdo malicioso passa pela detecção

**Mitigação:** A normalização básica (lowercase, remoção de zero-width chars) cobre casos simples. Ataques sofisticados (unicode spoofing, encoding) podem escapar — para esses casos, a mitigação correta seria via formatação do prompt (XML tags, system prompts separados), que está explicitamente fora do escopo desta issue.

### Risco 3: Diff malicioso de grande volume

**Probabilidade:** Baixa

**Impacto:** Latência na análise do diff (até 500KB)

**Mitigação:** Regex com `test()` (para boolean) é muito eficiente mesmo em strings grandes. Com os padrões propostos, o tempo esperado é < 10ms para um diff de 500KB.

### Trade-off: Segurança vs. falsos positivos

Os padrões são conservadores (alta especificidade). Isso significa que alguns ataques mais sutis podem não ser detectados. A alternativa seria regras mais amplas com maior risco de falso positivo. A postura adotada prioriza não bloquear usuários legítimos, aceitando que ataques muito elaborados podem precisar de mitigações complementares (fora do escopo).
