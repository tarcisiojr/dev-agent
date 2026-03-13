const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadJobs, upsertJob, generateJobId } = require('./jobStore');
const {
  buildRequirementsPrompt,
  buildDesignPrompt,
  buildTasksPrompt,
  buildImplementationPrompt,
  buildFinalizePrompt,
  buildCodeReviewPrompt,
} = require('./prompts');

const PORT = 9000;
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const WORKSPACE_DIR = '/workspace';
const ISSUES_DIR = path.join(WORKSPACE_DIR, 'issues');

/** Converte título em slug ASCII lowercase, truncado em 50 chars */
function slugify(title) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')    // caracteres especiais → hífen
    .replace(/-+/g, '-')            // hífens consecutivos → um só
    .replace(/^-|-$/g, '')          // remove hífens nas pontas
    .slice(0, 50)                   // trunca em 50 chars
    .replace(/-$/, '');             // remove hífen final após truncar
}

/** Retorna o diretório de specs para o job: docs/specs/{issueId}-{slug}/ */
function specsDir(job) {
  const slug = slugify(job.title);
  return `docs/specs/${job.issueId}-${slug}`;
}

/** Gera tag de log com contexto do job: [platform/repo#issue] */
function jobTag(job) {
  const id = job.type === 'review' ? ` PR#${job.prNumber}` : `#${job.issueId}`;
  return `[${job.platform}/${job.repoIdentifier}${id}]`;
}

// --- Fila sequencial ---

const queue = [];
let processing = false;

function enqueue(job) {
  // Gerar ID e persistir com status queued
  if (!job.id) {
    const idSuffix = job.type === 'review' ? `pr-${job.prNumber}` : job.issueId;
    job.id = generateJobId(job.platform, job.repoIdentifier, idSuffix);
  }
  if (!job.status) {
    job.status = 'queued';
    job.retryCount = 0;
    job.maxRetries = 3;
    job.createdAt = job.createdAt || new Date().toISOString();

    if (job.type === 'review') {
      job.phase = 'review';
    } else {
      job.phase = null;
      job.currentTask = 0;
      job.totalTasks = 0;
      job.phases = {
        requirements: 'pending',
        design: 'pending',
        tasks: 'pending',
        implementation: 'pending',
        finalize: 'pending',
      };
    }
  }
  upsertJob(job);

  queue.push(job);
  console.log(`[fila] ${jobTag(job)} adicionada. Tamanho da fila: ${queue.length}`);
  processNext();
}

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;

  const job = queue.shift();
  try {
    await executeJob(job);
  } catch (err) {
    console.error(`[erro] ${jobTag(job)} Falha ao processar:`, err.message);
  } finally {
    processing = false;
    processNext();
  }
}

// --- Validação de segurança ---

function detectPlatform(headers) {
  if (headers['x-gitlab-token']) return 'gitlab';
  if (headers['x-github-event']) return 'github';
  return null;
}

function validateGitLabToken(headers) {
  const token = headers['x-gitlab-token'];
  return token === process.env.GITLAB_SECRET;
}

function validateGitHubSignature(headers, body) {
  const signature = headers['x-hub-signature-256'];
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
  hmac.update(body);
  const expected = `sha256=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function isIssueEvent(platform, headers, payload) {
  if (platform === 'gitlab') return payload.object_kind === 'issue';
  if (platform === 'github') return headers['x-github-event'] === 'issues';
  return false;
}

function isPullRequestEvent(platform, headers, payload) {
  if (platform === 'gitlab') return payload.object_kind === 'merge_request';
  if (platform === 'github') return headers['x-github-event'] === 'pull_request';
  return false;
}

function isLabelAdded(platform, payload) {
  if (platform === 'gitlab') {
    const current = (payload.changes?.labels?.current || []).map(l => l.title);
    const previous = (payload.changes?.labels?.previous || []).map(l => l.title);
    return current.includes('ai-fix') && !previous.includes('ai-fix');
  }

  if (platform === 'github') {
    return payload.action === 'labeled' && payload.label?.name === 'ai-fix';
  }

  return false;
}

function isReviewLabelAdded(platform, payload) {
  if (platform === 'gitlab') {
    const current = (payload.changes?.labels?.current || []).map(l => l.title);
    const previous = (payload.changes?.labels?.previous || []).map(l => l.title);
    return current.includes('ai-review') && !previous.includes('ai-review');
  }

  if (platform === 'github') {
    return payload.action === 'labeled' && payload.label?.name === 'ai-review';
  }

  return false;
}

function isUserAuthorized(platform, payload) {
  const allowed = (process.env.ALLOWED_USERS || '').split(',').map(u => u.trim());

  if (platform === 'gitlab') return allowed.includes(payload.user?.username);
  if (platform === 'github') return allowed.includes(payload.sender?.login);
  return false;
}

// --- Extração de dados ---

function extractIssueData(platform, payload) {
  if (platform === 'gitlab') {
    return {
      platform,
      issueId: payload.object_attributes.iid,
      title: payload.object_attributes.title,
      description: payload.object_attributes.description || '',
      repoUrl: payload.project.git_http_url,
      projectId: payload.project.id,
      repoIdentifier: payload.project.path_with_namespace,
      user: payload.user?.username,
    };
  }

  return {
    platform,
    issueId: payload.issue.number,
    title: payload.issue.title,
    description: payload.issue.body || '',
    repoUrl: payload.repository.clone_url,
    projectId: null,
    repoIdentifier: payload.repository.full_name,
    user: payload.sender?.login,
  };
}

function extractPullRequestData(platform, payload) {
  if (platform === 'gitlab') {
    return {
      type: 'review',
      platform,
      prNumber: payload.object_attributes.iid,
      title: payload.object_attributes.title,
      sourceBranch: payload.object_attributes.source_branch,
      targetBranch: payload.object_attributes.target_branch,
      repoUrl: payload.project.git_http_url,
      projectId: payload.project.id,
      repoIdentifier: payload.project.path_with_namespace,
      user: payload.user?.username,
    };
  }

  return {
    type: 'review',
    platform,
    prNumber: payload.pull_request.number,
    title: payload.pull_request.title,
    sourceBranch: payload.pull_request.head.ref,
    targetBranch: payload.pull_request.base.ref,
    repoUrl: payload.repository.clone_url,
    projectId: null,
    repoIdentifier: payload.repository.full_name,
    user: payload.sender?.login,
  };
}

// --- Comentários na issue ---

async function commentOnIssue(job, message) {
  try {
    if (job.platform === 'gitlab') {
      await commentGitLab(job, message);
    } else {
      await commentGitHub(job, message);
    }
  } catch (err) {
    console.error(`[erro] ${jobTag(job)} Falha ao comentar na issue:`, err.message);
  }
}

async function commentGitLab(job, message) {
  const url = `https://gitlab.com/api/v4/projects/${job.projectId}/issues/${job.issueId}/notes`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': process.env.GITLAB_TOKEN,
    },
    body: JSON.stringify({ body: message }),
  });

  if (!res.ok) {
    throw new Error(`GitLab API retornou ${res.status}: ${await res.text()}`);
  }
}

async function commentGitHub(job, message) {
  const url = `https://api.github.com/repos/${job.repoIdentifier}/issues/${job.issueId}/comments`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'User-Agent': 'dev-agent',
    },
    body: JSON.stringify({ body: message }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API retornou ${res.status}: ${await res.text()}`);
  }
}

// --- Code Review ---

const MAX_DIFF_SIZE = 500 * 1024; // 500KB

/** Clona o repo, faz checkout na branch do PR e retorna o diff contra a branch base */
async function fetchPRDiff(job, worktreePath) {
  execSync(`git clone ${job.repoUrl} .`, { cwd: worktreePath, stdio: 'pipe' });
  execSync(`git checkout ${job.sourceBranch}`, { cwd: worktreePath, stdio: 'pipe' });
  execSync(`git fetch origin ${job.targetBranch}`, { cwd: worktreePath, stdio: 'pipe' });

  let diff = execSync(
    `git diff origin/${job.targetBranch}...HEAD`,
    { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  let truncated = false;
  if (Buffer.byteLength(diff, 'utf-8') > MAX_DIFF_SIZE) {
    diff = diff.slice(0, MAX_DIFF_SIZE);
    truncated = true;
  }

  return { diff, truncated };
}

/** Busca comentários de review existentes no PR via API da plataforma */
async function fetchExistingComments(job) {
  try {
    if (job.platform === 'github') {
      const url = `https://api.github.com/repos/${job.repoIdentifier}/pulls/${job.prNumber}/comments`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'User-Agent': 'dev-agent',
        },
      });
      if (!res.ok) return '';
      const comments = await res.json();
      if (comments.length === 0) return '';
      return comments.map(c => `[${c.user.login}] ${c.path}:${c.line || c.original_line}: ${c.body}`).join('\n');
    }

    if (job.platform === 'gitlab') {
      const url = `https://gitlab.com/api/v4/projects/${job.projectId}/merge_requests/${job.prNumber}/discussions`;
      const res = await fetch(url, {
        headers: { 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN },
      });
      if (!res.ok) return '';
      const discussions = await res.json();
      if (discussions.length === 0) return '';
      const lines = [];
      for (const d of discussions) {
        for (const note of (d.notes || [])) {
          const pos = note.position;
          const file = pos?.new_path || '';
          const line = pos?.new_line || '';
          lines.push(`[${note.author.username}] ${file}:${line}: ${note.body}`);
        }
      }
      return lines.join('\n');
    }
  } catch (err) {
    console.error(`[review] ${jobTag(job)} Falha ao buscar comentários existentes:`, err.message);
  }
  return '';
}

/** Retorna a lista de arquivos modificados no diff */
function fetchDiffFileList(job, worktreePath) {
  return execSync(
    `git diff --name-only origin/${job.targetBranch}...HEAD`,
    { cwd: worktreePath, encoding: 'utf-8' }
  ).trim().split('\n').filter(Boolean);
}

// --- Pipeline SDD ---

/** Retorna o path do artefato esperado para a fase, baseado no job */
function getPhaseArtifact(phaseName, job) {
  const dir = specsDir(job);
  const artifacts = {
    requirements: `${dir}/REQUIREMENTS.md`,
    design: `${dir}/DESIGN.md`,
    tasks: `${dir}/TASKS.md`,
    implementation: null,
    finalize: null,
  };
  return artifacts[phaseName] || null;
}

/** Mapa de prompt builders por fase */
const PHASE_PROMPT_BUILDERS = {
  requirements: buildRequirementsPrompt,
  design: buildDesignPrompt,
  tasks: buildTasksPrompt,
  implementation: buildImplementationPrompt,
  finalize: buildFinalizePrompt,
};

/** Labels curtos de cada fase (usados no resumo final) */
const PHASE_LABELS = {
  requirements: 'Requisitos',
  design: 'Design',
  tasks: 'Tarefas',
  implementation: 'Implementação',
  finalize: 'Finalização',
};

/** Ordem das fases do pipeline */
const PHASE_ORDER = ['requirements', 'design', 'tasks', 'implementation', 'finalize'];

/** Verifica se o artefato da fase existe no worktree */
function verifyPhaseArtifact(worktreePath, phaseName, job) {
  const artifact = getPhaseArtifact(phaseName, job);
  if (!artifact) return true; // implementation não tem artefato fixo
  return fs.existsSync(path.join(worktreePath, artifact));
}

/** Lê o conteúdo de um artefato da fase, se existir */
function readPhaseArtifact(issueDir, phaseName, job) {
  const artifact = getPhaseArtifact(phaseName, job);
  if (!artifact) return null;
  const filePath = path.join(issueDir, artifact);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

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

/** Conta tasks totais e concluídas no TASKS.md */
function countTasks(worktreePath, job) {
  const tasksPath = path.join(worktreePath, specsDir(job), 'TASKS.md');
  if (!fs.existsSync(tasksPath)) return { total: 0, done: 0 };

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const allTasks = (content.match(/- \[[ x]\]/g) || []);
  const doneTasks = (content.match(/- \[x\]/g) || []);
  return { total: allTasks.length, done: doneTasks.length };
}

/** Executa comando git no worktree e retorna stdout */
function gitExec(worktreePath, cmd) {
  return execSync(cmd, { cwd: worktreePath, encoding: 'utf-8' }).trim();
}

/**
 * Squash dos commits SDD (fases 1-3) em um único commit.
 * Chamado após a fase tasks completar com sucesso.
 */
function squashSddCommits(worktreePath, job) {
  const commits = gitExec(worktreePath, 'git log --oneline origin/main..HEAD');
  if (!commits) {
    console.log(`[squash] ${jobTag(job)} nenhum commit SDD para squash`);
    return;
  }

  const commitCount = commits.split('\n').length;
  console.log(`[squash] ${jobTag(job)} squashando ${commitCount} commits SDD`);

  gitExec(worktreePath, 'git reset --soft origin/main');
  gitExec(worktreePath, 'git add .');
  const msg = `docs(sdd): specs para issue #${job.issueId} - ${job.title}`;
  gitExec(worktreePath, `git commit -m "${msg.replace(/"/g, '\\"')}"`);

  console.log(`[squash] ${jobTag(job)} commits SDD squashados em 1`);
}

/**
 * Squash dos commits de implementação (fase 4) em um único commit.
 * Chamado após a fase implementation completar com sucesso.
 */
function squashImplCommits(worktreePath, job) {
  // Identificar o hash do commit SDD (primeiro commit após origin/main)
  // Pegar o primeiro commit após origin/main (commit SDD squashado)
  const allHashes = gitExec(worktreePath, 'git log --format=%H --reverse origin/main..HEAD');
  const sddHash = allHashes.split('\n')[0];
  if (!sddHash) {
    console.log(`[squash] ${jobTag(job)} nenhum commit SDD encontrado para referência`);
    return;
  }

  // Verificar se há commits de implementação após o SDD
  const implCommits = gitExec(worktreePath, `git log --oneline ${sddHash}..HEAD`);
  if (!implCommits) {
    console.log(`[squash] ${jobTag(job)} nenhum commit de implementação para squash`);
    return;
  }

  const commitCount = implCommits.split('\n').length;
  console.log(`[squash] ${jobTag(job)} squashando ${commitCount} commits de implementação`);

  gitExec(worktreePath, `git reset --soft ${sddHash}`);
  gitExec(worktreePath, 'git add .');
  const msg = `fix: ${job.title} #${job.issueId}`;
  gitExec(worktreePath, `git commit -m "${msg.replace(/"/g, '\\"')}"`);

  console.log(`[squash] ${jobTag(job)} commits de implementação squashados em 1`);
}

/**
 * Spawna o Claude Code com um prompt e retorna o resultado.
 * Reutilizado por todas as fases.
 */
function spawnClaude(prompt, cwd, { allowedTools = 'Bash,Read,Write,Edit,Glob,Grep', maxTurns = '50' } = {}) {
  return new Promise((resolve) => {
    const proc = spawn('claude', [
      '-p', '-',
      '--allowedTools', allowedTools,
      '--dangerously-skip-permissions',
      '--max-turns', maxTurns,
    ], {
      cwd,
      env: {
        ...process.env,
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      console.log(`[timeout] Spawn excedeu ${TIMEOUT_MS / 60000} minutos. Enviando SIGTERM...`);
      proc.kill('SIGTERM');
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: code === null });
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/**
 * Executa uma fase do pipeline SDD.
 * Retorna true se a fase foi concluída com sucesso.
 */
async function runPhase(job, phaseName, worktreePath) {
  const promptBuilder = PHASE_PROMPT_BUILDERS[phaseName];
  const prompt = promptBuilder(job);

  // Atualizar status no jobs.json
  job.status = 'running';
  job.phase = phaseName;
  job.phases[phaseName] = 'running';
  upsertJob(job);

  console.log(`[fase] ${jobTag(job)} iniciando fase: ${phaseName}`);

  const result = await spawnClaude(prompt, worktreePath);

  console.log(`[fase] ${jobTag(job)} fase ${phaseName} — exit code: ${result.code}`);

  if (result.code !== 0) {
    console.log(`[stderr] ${jobTag(job)} (${phaseName}):\n${result.stderr}`);
    console.log(`[stdout] ${jobTag(job)} (${phaseName}):\n${result.stdout.slice(-2000)}`);
  }

  // Verificar se artefato foi criado
  if (result.code === 0 && verifyPhaseArtifact(worktreePath, phaseName, job)) {
    job.phases[phaseName] = 'done';
    upsertJob(job);
    return { success: true, result };
  }

  return { success: false, result };
}

// --- Execução do job ---

async function executeJob(job) {
  // Despachar para review se for job de review
  if (job.type === 'review') {
    return executeReviewJob(job);
  }

  const startTime = Date.now();
  console.log(`[início] ${jobTag(job)} "${job.title}" — usuário: ${job.user}`);

  // Comentar na issue que o processamento iniciou
  await commentOnIssue(job, `🤖 **Claude Code** está analisando esta issue. Acompanhe o progresso...`);

  // Criar diretório de trabalho isolado usando job ID (único por plataforma/repo/issue)
  const issueDir = path.join(ISSUES_DIR, job.id);
  fs.mkdirSync(issueDir, { recursive: true });

  try {
    // Executar cada fase sequencialmente, pulando as já concluídas
    for (const phaseName of PHASE_ORDER) {
      // Pular fases já concluídas (retry/retomada)
      if (job.phases[phaseName] === 'done') {
        console.log(`[fase] ${jobTag(job)} fase ${phaseName} já concluída, pulando`);
        continue;
      }

      const { success, result } = await runPhase(job, phaseName, issueDir);

      if (!success) {
        // Verificar retry
        job.retryCount = (job.retryCount || 0) + 1;

        if (result.timedOut) {
          await commentOnIssue(job, `⏱️ Fase **${phaseName}** excedeu o tempo limite. Retentando automaticamente... (tentativa ${job.retryCount}/${job.maxRetries})`);
        }

        if (job.retryCount < job.maxRetries) {
          // Re-enfileirar para retry
          job.status = 'queued';
          job.phases[phaseName] = 'pending';
          upsertJob(job);
          console.log(`[retry] ${jobTag(job)} fase ${phaseName} falhou. Retry ${job.retryCount}/${job.maxRetries}`);
          enqueue(job);
          return;
        }

        // Limite de retries atingido
        job.status = 'needs_help';
        upsertJob(job);
        await commentOnIssue(job, `🆘 Não consegui completar a fase **${phaseName}** após ${job.maxRetries} tentativas. Preciso de ajuda humana.`);
        return;
      }

      // Fase concluída — comentar progresso e executar ações pós-fase
      const phaseIndex = PHASE_ORDER.indexOf(phaseName) + 1;
      const totalPhases = PHASE_ORDER.length;

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
    }

    // Pipeline completo
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[fim] ${jobTag(job)} pipeline SDD concluído — duração: ${duration}s`);

    job.status = 'done';
    upsertJob(job);

    const { total, done } = countTasks(issueDir, job);
    const phases = PHASE_ORDER.map(p => `✅ ${PHASE_LABELS[p]}`).join(' → ');

    // Verificar se há ações manuais pendentes
    const manualStepsPath = path.join(issueDir, specsDir(job), 'MANUAL_STEPS.md');
    let manualBlock = '';
    try {
      const manualContent = fs.readFileSync(manualStepsPath, 'utf-8');
      manualBlock = `\n\n---\n\n⚠️ **Ações manuais necessárias:**\n\n${manualContent}`;
    } catch {
      // Sem ações manuais
    }

    await commentOnIssue(job, `✅ **Concluído** — ${done}/${total} tarefas implementadas\n\n${phases}\n\n⏱️ ${duration}s${manualBlock}`);

  } finally {
    // Limpar diretório de trabalho após conclusão
    console.log(`[limpeza] ${jobTag(job)} removendo diretório de trabalho`);
    fs.rmSync(issueDir, { recursive: true, force: true });
  }
}

// --- Comentários no PR ---

async function commentOnPR(job, message) {
  try {
    if (job.platform === 'gitlab') {
      const url = `https://gitlab.com/api/v4/projects/${job.projectId}/merge_requests/${job.prNumber}/notes`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PRIVATE-TOKEN': process.env.GITLAB_TOKEN,
        },
        body: JSON.stringify({ body: message }),
      });
      if (!res.ok) throw new Error(`GitLab API retornou ${res.status}: ${await res.text()}`);
    } else {
      // GitHub usa o endpoint de issues para comentários gerais em PRs
      const url = `https://api.github.com/repos/${job.repoIdentifier}/issues/${job.prNumber}/comments`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'User-Agent': 'dev-agent',
        },
        body: JSON.stringify({ body: message }),
      });
      if (!res.ok) throw new Error(`GitHub API retornou ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[erro] ${jobTag(job)} Falha ao comentar no PR:`, err.message);
  }
}

// --- Posting de review comments ---

const SEVERITY_EMOJI = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

function formatCommentBody(comment) {
  const emoji = SEVERITY_EMOJI[comment.severity] || '⚪';
  return `${emoji} **[Severidade: ${comment.severity}]** **${comment.category}**\n\n${comment.body}`;
}

/** Extrai e valida o JSON de review do stdout do Claude */
function parseReviewOutput(stdout) {
  // Tentar extrair JSON do output (pode conter texto antes/depois)
  const jsonMatch = stdout.match(/\{[\s\S]*"verdict"[\s\S]*"comments"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[0]);
    // Validar campos obrigatórios
    if (!data.verdict || !data.summary || !Array.isArray(data.comments)) return null;
    if (!['APPROVE', 'REQUEST_CHANGES'].includes(data.verdict)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Posta review batch no GitHub (uma request com todos os comments) */
async function postGitHubReview(job, reviewData) {
  const url = `https://api.github.com/repos/${job.repoIdentifier}/pulls/${job.prNumber}/reviews`;

  const comments = reviewData.comments.map(c => ({
    path: c.path,
    line: c.line,
    body: formatCommentBody(c),
  }));

  const verdictText = reviewData.verdict === 'APPROVE' ? '✅ Aprovado' : '🔄 Alterações solicitadas';
  const summaryBody = `🤖 **Code Review Automatizado** — ${verdictText}\n\n${reviewData.summary}`;

  // Tentar postar review com inline comments
  if (comments.length > 0) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'dev-agent',
      },
      body: JSON.stringify({
        event: 'COMMENT',
        body: summaryBody,
        comments,
      }),
    });

    if (res.ok) return;

    // Fallback: inline comments falharam (path/line inválidos)
    // Postar como comentário geral com os findings listados
    console.log(`[review] ${jobTag(job)} inline comments falharam (${res.status}), usando fallback com comentário geral`);
  }

  // Fallback: postar tudo como comentário geral formatado
  let body = summaryBody;
  if (reviewData.comments.length > 0) {
    body += '\n\n---\n\n### Comentários do review\n';
    for (const c of reviewData.comments) {
      body += `\n${formatCommentBody(c)}\n📄 \`${c.path}:${c.line}\`\n`;
    }
  }

  await commentOnPR(job, body);
}

/** Posta review no GitLab (uma request por comment + nota geral) */
async function postGitLabReview(job, reviewData) {
  // Obter SHAs necessários para posicionar comments
  const repoDir = path.join(ISSUES_DIR, job.id);
  const headSha = gitExec(repoDir, 'git rev-parse HEAD');
  const baseSha = gitExec(repoDir, `git merge-base origin/${job.targetBranch} HEAD`);

  // Postar cada comment como discussion inline
  for (const comment of reviewData.comments) {
    try {
      const url = `https://gitlab.com/api/v4/projects/${job.projectId}/merge_requests/${job.prNumber}/discussions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PRIVATE-TOKEN': process.env.GITLAB_TOKEN,
        },
        body: JSON.stringify({
          body: formatCommentBody(comment),
          position: {
            position_type: 'text',
            base_sha: baseSha,
            head_sha: headSha,
            start_sha: baseSha,
            new_path: comment.path,
            new_line: comment.line,
          },
        }),
      });
      if (!res.ok) {
        console.error(`[review] ${jobTag(job)} Falha ao postar comment em ${comment.path}:${comment.line}: ${res.status}`);
      }
    } catch (err) {
      console.error(`[review] ${jobTag(job)} Erro ao postar comment:`, err.message);
    }
  }

  // Postar nota geral com summary e veredito
  const verdictText = reviewData.verdict === 'APPROVE' ? '✅ Aprovado' : '🔄 Alterações solicitadas';
  await commentOnPR(job, `🤖 **Code Review Automatizado** — ${verdictText}\n\n${reviewData.summary}`);
}

/** Despacha postagem de review para a plataforma correta */
async function postReviewComments(job, reviewData) {
  if (job.platform === 'github') {
    await postGitHubReview(job, reviewData);
  } else {
    await postGitLabReview(job, reviewData);
  }
}

// --- Execução do review ---

async function executeReviewJob(job) {
  const startTime = Date.now();
  console.log(`[review] ${jobTag(job)} "${job.title}" — usuário: ${job.user}`);

  await commentOnPR(job, '🤖 **Claude Code** está revisando este PR...');

  const workDir = path.join(ISSUES_DIR, job.id);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    job.status = 'running';
    upsertJob(job);

    // Clonar e preparar repositório
    console.log(`[review] ${jobTag(job)} clonando repositório e preparando diff`);
    const { diff, truncated } = await fetchPRDiff(job, workDir);

    if (truncated) {
      await commentOnPR(job, '⚠️ O diff deste PR é muito grande. O review será parcial (primeiros 500KB do diff).');
    }

    // Buscar comentários existentes
    const existingComments = await fetchExistingComments(job);
    console.log(`[review] ${jobTag(job)} comentários existentes: ${existingComments ? 'sim' : 'nenhum'}`);

    await commentOnPR(job, `📂 **Analisando diff** — ${diff.split('\n').length} linhas de alterações${truncated ? ' (truncado)' : ''}`);

    // Spawnar Claude para análise
    const prompt = buildCodeReviewPrompt(job, diff, existingComments);
    const result = await spawnClaude(prompt, workDir, {
      allowedTools: 'Bash,Read,Glob,Grep',
      maxTurns: '30',
    });

    if (result.code !== 0) {
      console.log(`[review] ${jobTag(job)} Claude falhou — exit code: ${result.code}`);
      console.log(`[stderr] ${jobTag(job)}:\n${result.stderr}`);

      job.retryCount = (job.retryCount || 0) + 1;
      if (job.retryCount < job.maxRetries) {
        job.status = 'queued';
        upsertJob(job);
        console.log(`[retry] ${jobTag(job)} retry ${job.retryCount}/${job.maxRetries}`);
        enqueue(job);
        return;
      }

      job.status = 'needs_help';
      upsertJob(job);
      await commentOnPR(job, '🆘 Não consegui completar o review. Preciso de ajuda humana.');
      return;
    }

    // Parsear resultado
    const reviewData = parseReviewOutput(result.stdout);

    if (!reviewData) {
      console.log(`[review] ${jobTag(job)} JSON inválido no output do Claude`);
      console.log(`[stdout] ${jobTag(job)}:\n${result.stdout.slice(-2000)}`);

      job.retryCount = (job.retryCount || 0) + 1;
      if (job.retryCount < job.maxRetries) {
        job.status = 'queued';
        upsertJob(job);
        console.log(`[retry] ${jobTag(job)} JSON inválido, retry ${job.retryCount}/${job.maxRetries}`);
        enqueue(job);
        return;
      }

      job.status = 'needs_help';
      upsertJob(job);
      await commentOnPR(job, '🆘 Não consegui completar o review após várias tentativas. Preciso de ajuda humana.');
      return;
    }

    // Postar review comments
    console.log(`[review] ${jobTag(job)} postando review: ${reviewData.verdict}, ${reviewData.comments.length} comments`);
    await postReviewComments(job, reviewData);

    // Resumo final
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const severityCounts = {};
    for (const c of reviewData.comments) {
      severityCounts[c.severity] = (severityCounts[c.severity] || 0) + 1;
    }
    const countsText = Object.entries(severityCounts)
      .map(([sev, count]) => `${SEVERITY_EMOJI[sev] || '⚪'} ${sev}: ${count}`)
      .join(' | ');

    const verdictEmoji = reviewData.verdict === 'APPROVE' ? '✅' : '🔄';
    const summaryMsg = [
      `${verdictEmoji} **Review concluído** — ${reviewData.comments.length} comentário(s)`,
      countsText ? `\n${countsText}` : '',
      `\n⏱️ ${duration}s`,
    ].join('');

    // No GitHub o veredito já foi postado via review API, só posta resumo no GitLab
    if (job.platform === 'gitlab') {
      // Summary já foi postado em postGitLabReview
    } else {
      await commentOnPR(job, summaryMsg);
    }

    job.status = 'done';
    upsertJob(job);
    console.log(`[review] ${jobTag(job)} review concluído — ${reviewData.verdict} — ${duration}s`);

  } finally {
    console.log(`[limpeza] ${jobTag(job)} removendo diretório de trabalho`);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// --- Servidor HTTP ---

const server = http.createServer((req, res) => {
  // Apenas POST /webhook é aceito
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      handleWebhook(req.headers, body, res);
    } catch (err) {
      console.error('[erro] Falha ao processar webhook:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  });
});

function handleWebhook(headers, body, res) {
  // Detectar plataforma
  const platform = detectPlatform(headers);
  if (!platform) {
    console.log('[webhook] Plataforma não reconhecida');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown platform' }));
    return;
  }

  // Validar token/assinatura
  if (platform === 'gitlab' && !validateGitLabToken(headers)) {
    console.log('[webhook] Token GitLab inválido');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (platform === 'github' && !validateGitHubSignature(headers, body)) {
    console.log('[webhook] Assinatura GitHub inválida');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const payload = JSON.parse(body);

  // Verificar se é evento de PR/MR com label ai-review
  if (isPullRequestEvent(platform, headers, payload) && isReviewLabelAdded(platform, payload)) {
    if (!isUserAuthorized(platform, payload)) {
      const user = platform === 'gitlab' ? payload.user?.username : payload.sender?.login;
      console.log(`[webhook] Usuário não autorizado para review: ${user}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ignored', reason: 'user not authorized' }));
      return;
    }

    const job = extractPullRequestData(platform, payload);
    enqueue(job);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued' }));
    return;
  }

  // Filtrar por evento de issue
  if (!isIssueEvent(platform, headers, payload)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ignored', reason: 'not an issue or PR event' }));
    return;
  }

  // Filtrar por label ai-fix adicionada
  if (!isLabelAdded(platform, payload)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ignored', reason: 'ai-fix label not added' }));
    return;
  }

  // Validar usuário autorizado
  if (!isUserAuthorized(platform, payload)) {
    const user = platform === 'gitlab' ? payload.user?.username : payload.sender?.login;
    console.log(`[webhook] Usuário não autorizado: ${user}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ignored', reason: 'user not authorized' }));
    return;
  }

  // Extrair dados e enfileirar
  const job = extractIssueData(platform, payload);
  enqueue(job);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'queued' }));
}

// --- Recovery de jobs na inicialização ---

function recoverJobs() {
  const jobs = loadJobs();
  const jobList = Object.values(jobs);
  let recovered = 0;

  for (const job of jobList) {
    if (job.status === 'running') {
      // Job interrompido — marcar como interrupted e re-enfileirar
      console.log(`[recovery] Job ${job.id} estava running — re-enfileirando`);
      job.status = 'queued';
      job.retryCount = (job.retryCount || 0) + 1;
      // Marcar fase atual como pending para re-executar (só para jobs SDD)
      if (job.phases && job.phase && job.phases[job.phase] === 'running') {
        job.phases[job.phase] = 'pending';
      }
      upsertJob(job);
      enqueue(job);
      recovered++;
    } else if (job.status === 'queued') {
      // Job na fila que não foi processado — re-enfileirar
      console.log(`[recovery] Job ${job.id} estava queued — re-enfileirando`);
      enqueue(job);
      recovered++;
    }
    // Jobs done, failed, needs_help são ignorados
  }

  if (recovered > 0) {
    console.log(`[recovery] ${recovered} job(s) recuperado(s)`);
  } else {
    console.log('[recovery] Nenhum job pendente encontrado');
  }
}

// Recuperar jobs antes de iniciar o servidor
recoverJobs();

server.listen(PORT, () => {
  console.log(`[server] Dev Agent rodando na porta ${PORT}`);
  console.log(`[server] Usuários autorizados: ${process.env.ALLOWED_USERS || '(nenhum)'}`);
});
