const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const JOBS_FILE = path.join('/workspace', 'jobs.json');

/** Carrega todos os jobs do arquivo JSON */
function loadJobs() {
  try {
    if (!fs.existsSync(JOBS_FILE)) return {};
    const data = fs.readFileSync(JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed.jobs || {};
  } catch (err) {
    console.error(`[jobStore] Falha ao ler jobs.json: ${err.message}`);
    return {};
  }
}

/**
 * Salva todos os jobs no arquivo JSON com escrita atômica.
 * Escreve em arquivo temporário e renomeia para evitar corrupção.
 */
function saveJobs(jobs) {
  const data = JSON.stringify({ jobs }, null, 2);
  const tmpFile = JOBS_FILE + `.tmp.${process.pid}`;

  try {
    const dir = path.dirname(JOBS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpFile, data, 'utf-8');
    fs.renameSync(tmpFile, JOBS_FILE);
  } catch (err) {
    console.error(`[jobStore] Falha ao salvar jobs.json: ${err.message}`);
    // Limpar arquivo temporário se existir
    try { fs.unlinkSync(tmpFile); } catch { /* ignora */ }
    throw err;
  }
}

/** Busca um job pelo ID */
function getJob(id) {
  const jobs = loadJobs();
  return jobs[id] || null;
}

/** Insere ou atualiza um job */
function upsertJob(job) {
  const jobs = loadJobs();
  job.updatedAt = new Date().toISOString();
  jobs[job.id] = job;
  saveJobs(jobs);
  return job;
}

/**
 * Gera ID único para o job no formato: {platform}-{slug}-{issueId}
 * Ex: github-tarcisiojr-ai-toolkit-42
 */
function generateJobId(platform, repoIdentifier, issueId) {
  const slug = repoIdentifier.replace(/\//g, '-');
  return `${platform}-${slug}-${issueId}`;
}

module.exports = { loadJobs, saveJobs, getJob, upsertJob, generateJobId };
