const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 9000;
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const WORKSPACE_DIR = '/workspace';

// --- Fila sequencial ---

const queue = [];
let processing = false;

function enqueue(job) {
  queue.push(job);
  console.log(`[fila] Issue #${job.issueId} adicionada. Tamanho da fila: ${queue.length}`);
  processNext();
}

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;

  const job = queue.shift();
  try {
    await executeJob(job);
  } catch (err) {
    console.error(`[erro] Falha ao processar issue #${job.issueId}:`, err.message);
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

// --- Comentários na issue ---

async function commentOnIssue(job, message) {
  try {
    if (job.platform === 'gitlab') {
      await commentGitLab(job, message);
    } else {
      await commentGitHub(job, message);
    }
  } catch (err) {
    console.error(`[erro] Falha ao comentar na issue #${job.issueId}:`, err.message);
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

// --- Execução do Claude Code ---

function buildPrompt(job) {
  const cliTool = job.platform === 'gitlab' ? 'glab' : 'gh';
  const mrOrPr = job.platform === 'gitlab' ? 'Merge Request' : 'Pull Request';
  const mrCommand = job.platform === 'gitlab'
    ? 'glab mr create --fill --source-branch fix/issue-' + job.issueId
    : 'gh pr create --fill --head fix/issue-' + job.issueId;

  return `Você é um agente autônomo. Resolva a issue abaixo sem interação humana.

Plataforma: ${job.platform}
Repositório: ${job.repoUrl}
Issue #${job.issueId}: ${job.title}

Descrição:
${job.description}

Instruções:
1. Clone o repositório: git clone ${job.repoUrl} .
2. Crie a branch: git checkout -b fix/issue-${job.issueId}
3. Analise o código e implemente a correção
4. Rode os testes existentes para garantir que nada quebrou
5. Faça commit das mudanças com mensagem descritiva referenciando a issue
6. Faça push da branch: git push origin fix/issue-${job.issueId}
7. Abra um ${mrOrPr}: ${mrCommand}

IMPORTANTE:
- Nunca pare para esperar input do usuário
- Se não conseguir resolver, documente o que tentou
- Mantenha as mudanças mínimas e focadas no problema`;
}

async function executeJob(job) {
  const startTime = Date.now();
  console.log(`[início] Processando issue #${job.issueId} "${job.title}" (${job.platform}) — usuário: ${job.user}`);

  // Comentar na issue que o processamento iniciou
  await commentOnIssue(job, `🤖 **Claude Code** está analisando esta issue. Acompanhe o progresso...`);

  // Criar diretório isolado
  const issueDir = path.join(WORKSPACE_DIR, `issue-${job.issueId}`);
  fs.mkdirSync(issueDir, { recursive: true });

  const prompt = buildPrompt(job);

  // Executar Claude Code via spawn
  const result = await new Promise((resolve) => {
    const proc = spawn('claude', [
      '-p', '-',
      '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep',
      '--dangerously-skip-permissions',
      '--max-turns', '50',
    ], {
      cwd: issueDir,
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

    // Timeout de 30 minutos
    const timer = setTimeout(() => {
      console.log(`[timeout] Issue #${job.issueId} excedeu 30 minutos. Enviando SIGTERM...`);
      proc.kill('SIGTERM');
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const timedOut = code === null;
      resolve({ code, stdout, stderr, timedOut });
    });

    // Enviar prompt via stdin
    proc.stdin.write(prompt);
    proc.stdin.end();
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[fim] Issue #${job.issueId} — exit code: ${result.code} — duração: ${duration}s`);

  if (result.code !== 0) {
    console.log(`[stderr] Issue #${job.issueId}:\n${result.stderr}`);
    console.log(`[stdout] Issue #${job.issueId}:\n${result.stdout.slice(-2000)}`);
  }

  // Comentar resultado na issue
  if (result.timedOut) {
    await commentOnIssue(job, `⏱️ **Claude Code** excedeu o tempo limite de 30 minutos para esta issue. Pode ser necessário intervenção manual.`);
  } else if (result.code === 0) {
    await commentOnIssue(job, `✅ **Claude Code** finalizou o trabalho nesta issue. Um Merge Request/Pull Request deve ter sido criado. Por favor, revise as mudanças.`);
  } else {
    await commentOnIssue(job, `❌ **Claude Code** não conseguiu resolver esta issue (exit code: ${result.code}). Pode ser necessário intervenção manual.`);
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

  // Filtrar por evento de issue
  if (!isIssueEvent(platform, headers, payload)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ignored', reason: 'not an issue event' }));
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

server.listen(PORT, () => {
  console.log(`[server] Dev Agent rodando na porta ${PORT}`);
  console.log(`[server] Usuários autorizados: ${process.env.ALLOWED_USERS || '(nenhum)'}`);
});
