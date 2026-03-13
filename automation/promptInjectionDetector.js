'use strict';

/**
 * Regras de detecção de prompt injection.
 * Cada regra possui: name, pattern (RegExp), description.
 */
const INJECTION_RULES = [
  // Grupo 1: Sobrescrita de instruções
  {
    name: 'override_instructions',
    pattern: /(ignore|disregard|forget|override)\s+(all\s+)?(the\s+)?(previous|above|prior|earlier)\s+(instructions?|rules?|guidelines?|context)/i,
    description: 'Tentativa de sobrescrever instruções anteriores',
  },
  {
    name: 'new_instructions',
    pattern: /\[new\s+instructions?\]|new\s+system\s+prompt|<\/?system>/i,
    description: 'Delimitadores de contexto usados em ataques documentados',
  },

  // Grupo 2: Redefinição de papel
  {
    name: 'role_redefinition',
    pattern: /(your\s+new\s+(role|persona|instructions?)\s+is|pretend\s+you\s+are\s+(a\s+)?(?:hacker|attacker|malicious)|from\s+now\s+on\s+you\s+(are|will|must))/i,
    description: 'Tentativa de redefinir o papel do agente',
  },

  // Grupo 3: Exfiltração de dados sensíveis
  {
    name: 'shell_exfiltration',
    pattern: /curl\s+https?:\/\/[^\s]+\s*\$\(|wget\s+.*\$\(cat\s+\/etc\//i,
    description: 'curl/wget com expansão de shell — indício de exfiltração',
  },
  {
    name: 'sensitive_file_read',
    pattern: /\$\(cat\s+\/etc\/(passwd|shadow|hosts)\)|`cat \/etc\/passwd`/i,
    description: 'Leitura de arquivos sensíveis em contexto de substituição de comando',
  },
  {
    name: 'token_exfiltration',
    pattern: /(exfiltr|transmit|send|leak|forward)\s+.*\b(GITHUB_TOKEN|GITLAB_TOKEN|API[_\s]?KEY|secret|password|credential)/i,
    description: 'Verbo de exfiltração + alvo sensível',
  },
  {
    name: 'env_in_url',
    pattern: /https?:\/\/[^\s]*\$\{?(GITHUB_TOKEN|GITLAB_TOKEN|AWS_SECRET|API_KEY)/i,
    description: 'Token em URL — exfiltração via requisição HTTP',
  },
];

/**
 * Normaliza o conteúdo para detecção:
 * - converte para lowercase
 * - remove zero-width characters
 *
 * @param {string} content
 * @returns {string}
 */
function normalizeContent(content) {
  if (!content) return '';
  // Remove zero-width characters (U+200B, U+200C, U+200D, U+FEFF, etc.)
  return content
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .toLowerCase();
}

/**
 * Detecta possível prompt injection no conteúdo fornecido.
 *
 * @param {string} content - Texto a ser analisado
 * @returns {{ detected: boolean, rule: string|null, match: string|null }}
 */
function detectPromptInjection(content) {
  if (!content) {
    return { detected: false, rule: null, match: null };
  }

  const normalized = normalizeContent(content);

  for (const rule of INJECTION_RULES) {
    const m = normalized.match(rule.pattern);
    if (m) {
      const matchText = m[0].slice(0, 200);
      return { detected: true, rule: rule.name, match: matchText };
    }
  }

  return { detected: false, rule: null, match: null };
}

module.exports = { detectPromptInjection };
