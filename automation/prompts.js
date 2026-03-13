/**
 * Prompt builders para o pipeline SDD.
 * Cada fase tem um prompt especializado que guia o Claude Code.
 */

/** Converte título em slug ASCII lowercase, truncado em 50 chars */
function slugify(title) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    .replace(/-$/, '');
}

/** Retorna o diretório de specs para o job */
function specsDir(job) {
  const slug = slugify(job.title);
  return `docs/specs/${job.issueId}-${slug}`;
}

// Bloco de autonomia incluído em todos os prompts
const AUTONOMY_RULES = `
REGRAS DE AUTONOMIA:
- Você é um agente autônomo. NUNCA pare para esperar input do usuário.
- Tome as melhores decisões sozinho. Documente decisões importantes nos artefatos.
- Se o repositório possuir um CLAUDE.md, respeite suas convenções.
- Se encontrar um problema que não consegue resolver, documente o que tentou.
- Mantenha mudanças mínimas e focadas no problema.
- SEMPRE faça as alterações de código você mesmo. NUNCA instrua o usuário a editar código.`.trim();

// Bloco de setup do git — usado na fase 1 para clonar e criar branch
function gitSetupBlock(job) {
  return `
SETUP DO REPOSITÓRIO:
O diretório atual pode estar vazio ou já conter o repositório clonado (em caso de retry).
Verifique e faça o setup conforme necessário:

1. Se o diretório estiver vazio (sem .git), clone o repositório:
   git clone ${job.repoUrl} .
2. Se já existir um clone (tem .git), atualize:
   git fetch origin && git pull origin main
3. Crie ou mude para a branch de trabalho:
   git checkout -b fix/issue-${job.issueId} origin/main
   (se a branch já existir, use: git checkout fix/issue-${job.issueId})

Resolva qualquer problema de git que aparecer. Você tem autonomia total.`.trim();
}

// Bloco de verificação do git — usado nas fases 2, 3 e 4
function gitVerifyBlock(job) {
  return `
VERIFICAÇÃO DO REPOSITÓRIO:
O repositório já deve estar clonado e a branch fix/issue-${job.issueId} ativa.
Verifique com: git status
Se algo estiver errado, corrija (git checkout, git pull, etc.) antes de prosseguir.`.trim();
}

function buildRequirementsPrompt(job) {
  return `Você é um agente autônomo executando a FASE 1 (Requisitos) de um pipeline SDD.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
Issue #${job.issueId}: ${job.title}

Descrição:
${job.description}

${gitSetupBlock(job)}

OBJETIVO: Analise a issue e o código existente, e gere um documento de requisitos.

INSTRUÇÕES:
1. Faça o setup do repositório conforme as instruções acima
2. Leia o código relevante do repositório para entender o contexto
3. Crie o diretório ${specsDir(job)}/ se não existir: mkdir -p ${specsDir(job)}
4. Gere o arquivo ${specsDir(job)}/REQUIREMENTS.md com:
   - Resumo do problema
   - Requisitos funcionais (o que o sistema deve fazer)
   - Requisitos não-funcionais (performance, segurança, etc., se aplicável)
   - Escopo: o que está incluído e excluído
   - Critérios de aceitação testáveis
5. NÃO implemente nada. Apenas analise e documente requisitos.

${AUTONOMY_RULES}`;
}

function buildDesignPrompt(job) {
  return `Você é um agente autônomo executando a FASE 2 (Design) de um pipeline SDD.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
Issue #${job.issueId}: ${job.title}

Descrição:
${job.description}

${gitVerifyBlock(job)}

OBJETIVO: Com base nos requisitos já definidos, crie um documento de design técnico.

INSTRUÇÕES:
1. Verifique que o repositório está correto e na branch certa
2. Leia ${specsDir(job)}/REQUIREMENTS.md para entender os requisitos
3. Analise o código existente para entender arquitetura e padrões em uso
4. Gere o arquivo ${specsDir(job)}/DESIGN.md com:
   - Contexto e estado atual do código
   - Abordagem técnica escolhida e justificativa
   - Componentes/arquivos que serão criados ou modificados
   - Modelos de dados (se aplicável)
   - Decisões técnicas com alternativas consideradas
   - Riscos e trade-offs
5. NÃO implemente nada. Apenas projete a solução.

${AUTONOMY_RULES}`;
}

function buildTasksPrompt(job) {
  return `Você é um agente autônomo executando a FASE 3 (Tarefas) de um pipeline SDD.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
Issue #${job.issueId}: ${job.title}

Descrição:
${job.description}

${gitVerifyBlock(job)}

OBJETIVO: Com base nos requisitos e design, quebre a implementação em tarefas atômicas.

INSTRUÇÕES:
1. Verifique que o repositório está correto e na branch certa
2. Leia ${specsDir(job)}/REQUIREMENTS.md e ${specsDir(job)}/DESIGN.md
3. Gere o arquivo ${specsDir(job)}/TASKS.md com:
   - Tarefas agrupadas por área (## 1. Nome do Grupo, ## 2. ...)
   - Cada tarefa como checkbox: - [ ] N.N Descrição da tarefa
   - Tarefas devem ser atômicas (completáveis em uma sessão)
   - Ordenadas por dependência (o que precisa ser feito primeiro)
   - Cada tarefa deve mapear para arquivos específicos quando possível
4. NÃO implemente nada. Apenas planeje as tarefas.

FORMATO OBRIGATÓRIO para cada tarefa:
- [ ] N.N Descrição clara e verificável

${AUTONOMY_RULES}`;
}

function buildImplementationPrompt(job) {
  return `Você é um agente autônomo executando a FASE 4 (Implementação) de um pipeline SDD.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
Issue #${job.issueId}: ${job.title}

${gitVerifyBlock(job)}

OBJETIVO: Implemente as tarefas definidas no TASKS.md, uma por uma.

INSTRUÇÕES:
1. Verifique que o repositório está correto e na branch certa
2. Leia ${specsDir(job)}/REQUIREMENTS.md, ${specsDir(job)}/DESIGN.md e ${specsDir(job)}/TASKS.md
3. Para cada tarefa pendente (marcada com - [ ]):
   a. Implemente a mudança no código
   b. Faça commit com mensagem descritiva referenciando a issue
   c. Atualize o ${specsDir(job)}/TASKS.md marcando a tarefa como concluída: - [x]
4. Rode os testes existentes para garantir que nada quebrou

NÃO faça push nem abra PR/MR — isso será feito em uma fase separada.

IMPORTANTE: Se já existem tarefas marcadas como - [x], elas já foram implementadas.
Continue a partir da primeira tarefa pendente (- [ ]).

REGRA FUNDAMENTAL: Você DEVE implementar TODAS as mudanças de código diretamente.
NUNCA instrua o usuário a fazer alterações no código — faça você mesmo.
Edite arquivos, crie arquivos, modifique configurações — tudo que for código, você faz.

AÇÕES MANUAIS (APENAS para casos impossíveis de automatizar):
Somente crie o arquivo ${specsDir(job)}/MANUAL_STEPS.md se existirem ações que são
IMPOSSÍVEIS de fazer via código, como:
- Criar secrets/tokens em serviços externos (AWS, GCP, etc.)
- Configurar DNS ou domínios
- Habilitar features em dashboards de terceiros
- Ações que requerem acesso a interfaces web externas

NÃO são ações manuais (faça você mesmo no código):
- Criar/editar variáveis de ambiente em arquivos (.env, .env.example, etc.)
- Rodar migrations (execute o comando)
- Instalar dependências (execute npm install, pip install, etc.)
- Configurar CI/CD (edite os arquivos de configuração)
- Qualquer mudança em arquivos do repositório

Formato do MANUAL_STEPS.md (se necessário):
- Cada ação como checkbox: - [ ] Descrição clara da ação
- Agrupe por contexto se necessário (ex: ## Servidor, ## CI/CD)
- Inclua comandos exatos quando possível

${AUTONOMY_RULES}`;
}

function buildFinalizePrompt(job) {
  const mrOrPr = job.platform === 'gitlab' ? 'Merge Request' : 'Pull Request';
  const mrCommand = job.platform === 'gitlab'
    ? 'glab mr create --fill --source-branch fix/issue-' + job.issueId
    : 'gh pr create --fill --head fix/issue-' + job.issueId;

  return `Você é um agente autônomo executando a FASE 5 (Finalização) de um pipeline SDD.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
Issue #${job.issueId}: ${job.title}

${gitVerifyBlock(job)}

OBJETIVO: Faça push da branch e abra um ${mrOrPr}.

INSTRUÇÕES:
1. Verifique que o repositório está correto e na branch fix/issue-${job.issueId}
2. Verifique que existem commits na branch (git log --oneline origin/main..HEAD)
3. Faça push da branch: git push origin fix/issue-${job.issueId}
4. Verifique se existe o arquivo ${specsDir(job)}/MANUAL_STEPS.md
5. Abra um ${mrOrPr} com descrição detalhada:
   - Use: ${mrCommand} --title "fix: issue #${job.issueId}" --body "CORPO"
   - No CORPO inclua: resumo das mudanças e referência à issue (#${job.issueId})
   - Se ${specsDir(job)}/MANUAL_STEPS.md existir, inclua seu conteúdo na descrição
     sob a seção "## Ações manuais necessárias" para que o revisor saiba o que fazer
6. Confirme que o ${mrOrPr} foi criado com sucesso

Se o push falhar por causa de conflitos, tente fazer rebase:
   git fetch origin && git rebase origin/main
   Resolva conflitos se necessário, depois faça push novamente.

Se o ${mrOrPr} já existir, apenas confirme e prossiga.

${AUTONOMY_RULES}`;
}

function buildCodeReviewPrompt(job, diff, existingComments) {
  const commentsBlock = existingComments
    ? `\nCOMENTÁRIOS EXISTENTES NO PR (NÃO repita problemas já discutidos):\n${existingComments}\n`
    : '\nNenhum comentário de review existente neste PR.\n';

  return `Você é um agente autônomo realizando code review de um Pull Request.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
PR #${job.prNumber}: ${job.title}
Branch: ${job.sourceBranch} → ${job.targetBranch}

${commentsBlock}

DIFF DO PR:
\`\`\`diff
${diff}
\`\`\`

OBJETIVO: Analise o diff acima e produza um review detalhado com inline comments.

INSTRUÇÕES DE ANÁLISE:
1. Para cada arquivo modificado no diff, analise:
   - Bugs e problemas lógicos
   - Vulnerabilidades de segurança (OWASP top 10)
   - Breaking changes: se uma assinatura de função/método/API mudou, use Glob e Grep para buscar TODOS os chamadores no repositório e verifique se serão afetados
   - Problemas de performance (N+1, loops desnecessários, etc.)
   - Qualidade de código (duplicação, naming, legibilidade)

2. Para análise de impacto em contratos alterados:
   - Se uma função teve sua assinatura alterada, busque chamadores com: grep -rn "nomeDaFuncao" no repositório
   - Se uma interface/type mudou, busque implementações e usos
   - Reporte TODOS os arquivos que serão afetados pela mudança

3. NÃO repita problemas que já foram discutidos nos comentários existentes acima.

4. Seja objetivo e específico. Cada comment deve apontar o problema exato e sugerir como corrigir.

FORMATO DE OUTPUT OBRIGATÓRIO:
Retorne APENAS um JSON válido, sem texto antes ou depois. O JSON deve seguir este formato:

{
  "verdict": "APPROVE" | "REQUEST_CHANGES",
  "summary": "Resumo geral do review em 1-3 frases",
  "comments": [
    {
      "path": "caminho/do/arquivo.js",
      "line": 42,
      "severity": "critical" | "high" | "medium" | "low",
      "category": "bug" | "security" | "breaking_change" | "performance" | "quality",
      "body": "Descrição detalhada do problema e sugestão de correção"
    }
  ]
}

REGRAS DO VEREDITO:
- Use "REQUEST_CHANGES" se houver qualquer comment com severity "critical" ou "high"
- Use "APPROVE" se não houver problemas ou apenas comments "medium"/"low"

REGRAS DO JSON:
- "line" deve ser o número da linha no arquivo MODIFICADO (new file), não a posição no diff
- Se não encontrar problemas, retorne comments como array vazio
- NUNCA inclua texto fora do JSON

${AUTONOMY_RULES}`;
}

module.exports = {
  buildRequirementsPrompt,
  buildDesignPrompt,
  buildTasksPrompt,
  buildImplementationPrompt,
  buildFinalizePrompt,
  buildCodeReviewPrompt,
};
