# Requisitos — Issue #1: Artefatos nos comentários de progresso por fase

## Resumo do Problema

Atualmente, o pipeline SDD (Spec-Driven Development) posta comentários de progresso na issue ao final de cada fase, mas os artefatos gerados (REQUIREMENTS.md, DESIGN.md, TASKS.md) só são incluídos no **comentário final** após o pipeline completo.

O usuário não consegue acompanhar o conteúdo dos artefatos conforme eles são gerados — precisa esperar o pipeline inteiro terminar para ver qualquer artefato.

**Localização do código relevante:** `automation/server.js`, função `executeJob` (linhas ~608–660).

### Comportamento Atual

1. Fase `requirements` conclui → posta: `📋 Fase 1/5 — Requisitos concluído` (sem artefato)
2. Fase `design` conclui → posta: `🏗️ Fase 2/5 — Design concluído` (sem artefato)
3. Fase `tasks` conclui → posta: `📝 Fase 3/5 — N tarefas identificadas` (sem artefato)
4. Fase `implementation` conclui → posta progresso (sem artefato)
5. Pipeline completo → posta comentário final **com todos os artefatos** em `<details>`

### Comportamento Esperado

Ao concluir cada fase que gera um artefato, o comentário de progresso já deve incluir o conteúdo do artefato gerado naquela fase.

---

## Requisitos Funcionais

### RF-01 — Artefato de Requisitos no comentário da fase `requirements`

Quando a fase `requirements` concluir com sucesso e o arquivo `REQUIREMENTS.md` existir, o comentário de progresso postado na issue **deve incluir** o conteúdo do `REQUIREMENTS.md` dentro de um bloco `<details>` expansível.

### RF-02 — Artefato de Design no comentário da fase `design`

Quando a fase `design` concluir com sucesso e o arquivo `DESIGN.md` existir, o comentário de progresso postado na issue **deve incluir** o conteúdo do `DESIGN.md` dentro de um bloco `<details>` expansível.

### RF-03 — Artefato de Tarefas no comentário da fase `tasks`

Quando a fase `tasks` concluir com sucesso e o arquivo `TASKS.md` existir, o comentário de progresso postado na issue **deve incluir** o conteúdo do `TASKS.md` dentro de um bloco `<details>` expansível.

### RF-04 — Artefatos removidos do comentário final

Para evitar duplicação de conteúdo, os artefatos SDD **não devem ser repetidos** no comentário final do pipeline. O comentário final deve manter apenas o resumo de conclusão (fases, tarefas, duração, ações manuais).

### RF-05 — Artefatos ausentes não devem causar erro

Se por algum motivo o artefato esperado não existir (falha parcial recuperada, artefato não gerado), o comentário de progresso deve ser postado normalmente, **sem** incluir o bloco `<details>`.

---

## Requisitos Não-Funcionais

### RNF-01 — Sem impacto no fluxo do pipeline

A inclusão dos artefatos nos comentários de progresso não deve alterar a lógica de execução das fases, retry, squash de commits ou qualquer outro comportamento do pipeline.

### RNF-02 — Formatação consistente

O bloco `<details>` usado nos comentários de progresso por fase deve ter o mesmo formato já utilizado no comentário final:

```markdown
<details>
<summary>{Label}</summary>

{conteúdo do artefato}

</details>
```

### RNF-03 — Sem chamadas de API adicionais

A inclusão do artefato deve ser feita lendo o arquivo do worktree local (já disponível em `issueDir`), sem chamadas extras à API da plataforma.

---

## Escopo

### Incluído

- Modificar os comentários de progresso das fases `requirements`, `design` e `tasks` para incluir o artefato gerado.
- Remover os artefatos SDD do comentário final (para evitar duplicidade).
- A função `readPhaseArtifact` já existe e pode ser reutilizada diretamente.

### Excluído

- Fase `implementation`: não gera artefato fixo — sem alteração.
- Fase `finalize`: não gera artefato — sem alteração.
- Revisão de PRs (`executeReviewJob`): fora do escopo.
- Alterações na estrutura de artefatos ou nos prompts de cada fase.
- Criação de novos endpoints ou mudanças na API do servidor.

---

## Critérios de Aceitação

### CA-01

**Dado** que a fase `requirements` conclui com sucesso,
**Quando** o comentário de progresso é postado na issue,
**Então** ele deve conter um bloco `<details><summary>📋 Requisitos</summary>` com o conteúdo do `REQUIREMENTS.md`.

### CA-02

**Dado** que a fase `design` conclui com sucesso,
**Quando** o comentário de progresso é postado na issue,
**Então** ele deve conter um bloco `<details><summary>🏗️ Design</summary>` com o conteúdo do `DESIGN.md`.

### CA-03

**Dado** que a fase `tasks` conclui com sucesso,
**Quando** o comentário de progresso é postado na issue,
**Então** ele deve conter um bloco `<details><summary>📝 Tarefas</summary>` com o conteúdo do `TASKS.md`.

### CA-04

**Dado** que o pipeline completo termina com sucesso,
**Quando** o comentário final é postado na issue,
**Então** ele **não deve conter** artefatos SDD duplicados (REQUIREMENTS.md, DESIGN.md, TASKS.md).

### CA-05

**Dado** que o artefato de uma fase não foi gerado (arquivo inexistente),
**Quando** o comentário de progresso é postado,
**Então** o comentário deve ser postado normalmente **sem** bloco `<details>` de artefato.

### CA-06

**Dado** que a fase `implementation` conclui com sucesso,
**Quando** o comentário de progresso é postado,
**Então** o comportamento deve permanecer **igual ao atual** (sem artefato — implementação não gera artefato fixo).
