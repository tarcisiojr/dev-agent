# Design Técnico — Issue #1: Artefatos nos comentários de progresso por fase

## 1. Contexto e Estado Atual do Código

### Arquivo relevante
`automation/server.js` — função `executeJob` (~linhas 608–660)

### Fluxo atual (resumido)

Após cada fase do pipeline, o bloco `if/else if` na linha ~612 decide qual comentário postar:

```
phaseName === 'tasks'          → posta "N tarefas identificadas"    (sem artefato)
phaseName === 'implementation' → posta "Implementação concluída"    (sem artefato)
phaseName === 'finalize'       → não posta nada
else (requirements / design)   → posta "Fase X/Y — <label> concluído" (sem artefato)
```

Após o loop de fases, o comentário final (pipeline completo) monta `sddBlock` lendo os artefatos das três fases via `readPhaseArtifact` e os inclui em blocos `<details>`.

### Funções utilitárias já existentes

| Função | Localização | Responsabilidade |
|---|---|---|
| `readPhaseArtifact(issueDir, phaseName, job)` | linha ~397 | Lê o artefato da fase; retorna `null` se inexistente |
| `getPhaseArtifact(phaseName, job)` | linha ~356 | Retorna o path relativo do artefato (ou `null` para `implementation`) |
| `specsDir(job)` | linha ~35 | Retorna `docs/specs/{issueId}-{slug}` |

---

## 2. Abordagem Técnica Escolhida

### Decisão central
Adicionar uma função auxiliar `buildArtifactBlock(issueDir, phaseName, job)` que encapsula a lógica de ler o artefato e formatar o bloco `<details>`. Essa função é chamada nos três pontos de `commentOnIssue` das fases `requirements`, `design` e `tasks`, concatenando o bloco ao texto existente.

O bloco de montagem do `sddBlock` no comentário final é então **removido**, eliminando a duplicação (RF-04).

### Justificativa
- Evita triplicar a lógica de formatação inline nos três branches do `if/else if`.
- Centraliza o tratamento de artefato ausente (retorna `''`), satisfazendo RF-05 sem alterar a lógica de chamada.
- Mudança cirúrgica: toca apenas o trecho de comentários de progresso e o trecho do comentário final — sem alterar runPhase, retry, squash ou qualquer outra lógica.

---

## 3. Componentes e Arquivos Modificados

### `automation/server.js` — única modificação necessária

#### 3.1 Nova função auxiliar `buildArtifactBlock`

Inserir logo após `readPhaseArtifact` (linha ~406):

```js
/**
 * Retorna um bloco <details> com o conteúdo do artefato da fase,
 * ou string vazia se o artefato não existir.
 */
function buildArtifactBlock(issueDir, phaseName, job) {
  const labels = { requirements: '📋 Requisitos', design: '🏗️ Design', tasks: '📝 Tarefas' };
  const content = readPhaseArtifact(issueDir, phaseName, job);
  if (!content || !labels[phaseName]) return '';
  return `\n\n<details>\n<summary>${labels[phaseName]}</summary>\n\n${content}\n\n</details>`;
}
```

#### 3.2 Atualizar comentários de progresso por fase (~linhas 612–626)

**Antes:**
```js
if (phaseName === 'tasks') {
  const { total } = countTasks(issueDir, job);
  job.totalTasks = total;
  upsertJob(job);
  squashSddCommits(issueDir, job);
  await commentOnIssue(job, `📝 **Fase ${phaseIndex}/${totalPhases}** — ${total} tarefas identificadas`);
} else if (phaseName === 'implementation') {
  squashImplCommits(issueDir, job);
  const { total, done } = countTasks(issueDir, job);
  await commentOnIssue(job, `⚙️ **Fase ${phaseIndex}/${totalPhases}** — Implementação concluída (${done}/${total} tarefas)`);
} else if (phaseName === 'finalize') {
  // Comentário final cobre a finalização
} else {
  await commentOnIssue(job, `${phaseName === 'requirements' ? '📋' : '🏗️'} **Fase ${phaseIndex}/${totalPhases}** — ${PHASE_LABELS[phaseName]} concluído`);
}
```

**Depois:**
```js
if (phaseName === 'tasks') {
  const { total } = countTasks(issueDir, job);
  job.totalTasks = total;
  upsertJob(job);
  squashSddCommits(issueDir, job);
  await commentOnIssue(job, `📝 **Fase ${phaseIndex}/${totalPhases}** — ${total} tarefas identificadas${buildArtifactBlock(issueDir, phaseName, job)}`);
} else if (phaseName === 'implementation') {
  squashImplCommits(issueDir, job);
  const { total, done } = countTasks(issueDir, job);
  await commentOnIssue(job, `⚙️ **Fase ${phaseIndex}/${totalPhases}** — Implementação concluída (${done}/${total} tarefas)`);
} else if (phaseName === 'finalize') {
  // Comentário final cobre a finalização
} else {
  await commentOnIssue(job, `${phaseName === 'requirements' ? '📋' : '🏗️'} **Fase ${phaseIndex}/${totalPhases}** — ${PHASE_LABELS[phaseName]} concluído${buildArtifactBlock(issueDir, phaseName, job)}`);
}
```

#### 3.3 Remover sddBlock do comentário final (~linhas 639–648)

**Antes:**
```js
// Montar blocos com conteúdo dos artefatos SDD
const sddPhases = ['requirements', 'design', 'tasks'];
const sddLabels = { requirements: '📋 Requisitos', design: '🏗️ Design', tasks: '📝 Tarefas' };
let sddBlock = '';
for (const phase of sddPhases) {
  const content = readPhaseArtifact(issueDir, phase, job);
  if (content) {
    sddBlock += `\n\n<details>\n<summary>${sddLabels[phase]}</summary>\n\n${content}\n\n</details>`;
  }
}
...
await commentOnIssue(job, `✅ **Concluído** — ${done}/${total} tarefas implementadas\n\n${phases}\n\n⏱️ ${duration}s${sddBlock}${manualBlock}`);
```

**Depois:**
```js
// (bloco sddBlock removido — artefatos já foram postados em cada fase)
...
await commentOnIssue(job, `✅ **Concluído** — ${done}/${total} tarefas implementadas\n\n${phases}\n\n⏱️ ${duration}s${manualBlock}`);
```

---

## 4. Modelos de Dados

Nenhuma mudança em estruturas de dados ou persistência. O job object não é alterado.

---

## 5. Decisões Técnicas e Alternativas

### Decisão 1: Função auxiliar vs. inline

| Opção | Prós | Contras |
|---|---|---|
| **Função auxiliar `buildArtifactBlock`** (escolhida) | DRY; lógica de labels e fallback centralizada | +1 função no módulo |
| Lógica inline em cada branch | Zero abstração nova | Labels e fallback triplicados |

**Escolha:** função auxiliar — reduz risco de inconsistência e facilita futura manutenção.

### Decisão 2: Remover sddBlock do comentário final vs. manter

O requisito RF-04 é explícito: remover para evitar duplicação. O usuário já viu cada artefato na fase correspondente. Manter seria redundante e aumentaria o tamanho do comentário final desnecessariamente.

**Escolha:** remover o bloco `sddBlock` por completo do comentário final.

### Decisão 3: Onde inserir `buildArtifactBlock`

Colocar imediatamente após `readPhaseArtifact` mantém a coesão — as três funções relacionadas a artefatos ficam agrupadas no mesmo local.

---

## 6. Riscos e Trade-offs

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Artefato grande aumenta tamanho do comentário | Baixa (artefatos SDD são curtos) | Sem mitigação necessária; `readPhaseArtifact` já lê o arquivo inteiro |
| Usuário não encontra artefatos no comentário final | Intencional (RF-04) | Documentar no PR que artefatos foram movidos para os comentários por fase |
| Quebra de comportamento em fases sem artefato | Muito baixa | `buildArtifactBlock` retorna `''` se artefato ausente ou fase sem label (ex: `implementation`) |

### Trade-off principal
Ao remover os artefatos do comentário final, o último comentário fica mais enxuto — mas o usuário precisa rolar pelos comentários anteriores para relembrar os artefatos. Para o público-alvo (desenvolvedor acompanhando o pipeline em tempo real), isso é um ganho líquido.

---

## 7. Mapeamento Requisito → Implementação

| Requisito | Implementação |
|---|---|
| RF-01 Requisitos no comentário da fase `requirements` | `buildArtifactBlock` chamado no `else` branch |
| RF-02 Design no comentário da fase `design` | `buildArtifactBlock` chamado no `else` branch |
| RF-03 Tarefas no comentário da fase `tasks` | `buildArtifactBlock` chamado no `tasks` branch |
| RF-04 Remover artefatos do comentário final | Remoção do loop `sddBlock` e da variável `sddBlock` no texto final |
| RF-05 Artefato ausente não causa erro | `readPhaseArtifact` retorna `null` → `buildArtifactBlock` retorna `''` |
| RNF-01 Sem impacto no fluxo | Apenas o texto do comentário muda; nenhuma lógica de fase alterada |
| RNF-02 Formatação consistente | Mesmo template `<details><summary>…</summary>\n\n…\n\n</details>` |
| RNF-03 Sem chamadas de API adicionais | `buildArtifactBlock` usa `readPhaseArtifact` que lê arquivo local |
