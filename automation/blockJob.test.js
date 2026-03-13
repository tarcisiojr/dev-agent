'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

// Spy on upsertJob before loading server so calls are tracked
const jobStore = require('./jobStore');
const upsertJobSpy = mock.method(jobStore, 'upsertJob', (job) => job);

const { blockJob } = require('./server');

const makeJob = () => ({
  id: 'github-org-repo-1',
  platform: 'github',
  repoIdentifier: 'org/repo',
  issueId: '1',
  title: 'Test issue',
  status: 'queued',
});

const detectionResult = {
  rule: 'override_instructions',
  match: 'ignore all previous instructions',
};

// 2.2 — blockJob resolve normalmente quando commentFn rejeita com "API timeout"
test('blockJob resolve sem propagar erro quando commentFn rejeita', async () => {
  const commentFn = async () => { throw new Error('API timeout'); };

  await assert.doesNotReject(
    () => blockJob(makeJob(), 'title', detectionResult, commentFn)
  );
});

// 2.3 — console.error é chamado com prefixo [security] quando commentFn falha
test('blockJob loga console.error com prefixo [security] quando commentFn falha', async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  try {
    const commentFn = async () => { throw new Error('API timeout'); };
    await blockJob(makeJob(), 'title', detectionResult, commentFn);
  } finally {
    console.error = originalError;
  }

  assert.ok(
    errors.some((msg) => msg.includes('[security]')),
    'Esperado log com prefixo [security]'
  );
  assert.ok(
    errors.some((msg) => msg.includes('API timeout')),
    'Esperado log com mensagem de erro'
  );
});

// 2.4 — upsertJob é chamado com status 'blocked' mesmo quando commentFn falha
test('blockJob persiste job com status blocked mesmo quando commentFn falha', async () => {
  upsertJobSpy.mock.resetCalls();

  const commentFn = async () => { throw new Error('API timeout'); };
  const job = makeJob();

  await blockJob(job, 'title', detectionResult, commentFn);

  assert.equal(job.status, 'blocked', 'job.status deve ser blocked');
  assert.ok(
    upsertJobSpy.mock.calls.length > 0,
    'upsertJob deve ter sido chamado'
  );
  assert.equal(
    upsertJobSpy.mock.calls[0].arguments[0].status,
    'blocked',
    'upsertJob deve ter sido chamado com status blocked'
  );
});
