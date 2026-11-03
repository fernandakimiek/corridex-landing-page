import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const MAX_POLICY_BYTES = 16 * 1024;

const REASONS = ['offerReading', 'stability', 'dataSafety', 'security', 'general'];
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const VERSION_RE = /^\d+(\.\d+){0,2}$/;

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '../../schemas/app-update-v1.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function ruleLabel(doc, index) {
  const id = doc?.rules?.[index]?.id;
  return typeof id === 'string' && id ? id : `rules[${index}]`;
}

function formatAjvError(error, doc) {
  const path = error.instancePath || '';
  const ruleMatch = path.match(/^\/rules\/(\d+)(?:\/(\w+))?$/);

  if (error.keyword === 'maxItems' && path === '/rules') {
    return 'rules aceita no máximo 20 itens';
  }

  if (error.keyword === 'const' && path === '/schemaVersion') {
    return 'schemaVersion precisa ser 1';
  }

  if (error.keyword === 'type' && path === '') {
    return 'o arquivo precisa ser um objeto JSON';
  }

  if (error.keyword === 'type' && path === '/rules') {
    return 'rules precisa ser uma lista, ex.: []';
  }

  if (error.keyword === 'required' && !ruleMatch) {
    const missing = error.params.missingProperty;
    if (missing === 'schemaVersion') return 'schemaVersion é obrigatório e precisa ser 1';
    if (missing === 'rules') return 'rules é obrigatório e precisa ser uma lista, ex.: []';
    return `o campo ${missing} é obrigatório`;
  }

  if (!ruleMatch) {
    return `o arquivo não segue o schema app-update v1 (${error.keyword}${path ? ` em ${path}` : ''})`;
  }

  const index = Number(ruleMatch[1]);
  const field = ruleMatch[2];
  const id = ruleLabel(doc, index);

  if (error.keyword === 'required') {
    const missing = error.params.missingProperty;
    const examples = {
      id: '2026-11-leitura-uber',
      level: 'recommended',
      minimumVersion: '2.0.55',
      reason: 'general',
    };
    return `regra ${id}: ${missing} é obrigatório, ex.: ${examples[missing] ?? missing}`;
  }

  if (!field && error.keyword === 'type') {
    return `regra ${id}: a regra precisa ser um objeto`;
  }

  if (field === 'id') {
    return `regra ${id}: id precisa ter de 3 a 64 caracteres (letras minúsculas, números ou hífen), ex.: 2026-11-leitura-uber`;
  }

  if (field === 'level') {
    return `regra ${id}: level precisa ser "recommended" ou "required"`;
  }

  if (field === 'minimumVersion') {
    return `regra ${id}: minimumVersion precisa ser números e pontos, ex.: 2.0.55`;
  }

  if (field === 'reason') {
    return `regra ${id}: reason precisa ser um destes: ${REASONS.join(', ')}`;
  }

  if (field === 'enforcedFrom') return null;

  return `regra ${id}: o campo ${field} é inválido`;
}

function customChecks(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.rules)) return errors;

  const seen = new Map();
  doc.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return;
    const id = ruleLabel(doc, index);

    if (typeof rule.id === 'string') {
      if (seen.has(rule.id)) {
        errors.push(`regra ${rule.id}: id está repetido, ex.: 2026-12-outro-assunto`);
      } else {
        seen.set(rule.id, index);
      }
    }

    if (rule.enforcedFrom !== undefined && rule.level !== 'required') {
      errors.push(`regra ${id}: enforcedFrom só pode existir em level "required", ex.: 2026-12-01T03:00:00Z`);
    }

    if (rule.enforcedFrom !== undefined) {
      const value = rule.enforcedFrom;
      const utc = typeof value === 'string' && UTC_RE.test(value) && !Number.isNaN(Date.parse(value));
      if (!utc) {
        errors.push(`regra ${id}: enforcedFrom precisa estar em UTC e terminar em Z, ex.: 2026-12-01T03:00:00Z`);
      }
    }
  });

  return errors;
}

/**
 * @param {unknown} doc
 * @param {{ byteLength?: number }} [options]
 * @returns {string[]}
 */
export function validatePolicy(doc, options = {}) {
  const errors = [];
  const byteLength = options.byteLength ?? Buffer.byteLength(JSON.stringify(doc ?? null));
  if (byteLength > MAX_POLICY_BYTES) {
    errors.push(`o arquivo tem ${byteLength} bytes e o limite é ${MAX_POLICY_BYTES}`);
  }

  if (!validate(doc)) {
    for (const error of validate.errors ?? []) {
      const message = formatAjvError(error, doc);
      if (message) errors.push(message);
    }
  }

  errors.push(...customChecks(doc));
  return [...new Set(errors)];
}

export function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const da = a[i] ?? 0;
    const db = b[i] ?? 0;
    if (!Number.isInteger(da) || !Number.isInteger(db)) return null;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/**
 * @param {unknown} doc
 * @param {string} storeVersion
 * @returns {string[]}
 */
export function checkAgainstStore(doc, storeVersion) {
  if (typeof storeVersion !== 'string' || !/^\d+(\.\d+)*$/.test(storeVersion)) {
    return [`versão da App Store inválida: ${storeVersion}`];
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.rules)) return [];

  const errors = [];
  doc.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return;
    if (rule.level !== 'recommended' && rule.level !== 'required') return;
    if (typeof rule.minimumVersion !== 'string' || !VERSION_RE.test(rule.minimumVersion)) return;
    const cmp = compareVersions(rule.minimumVersion, storeVersion);
    if (cmp === null || cmp <= 0) return;
    const id = ruleLabel(doc, index);
    errors.push(
      `regra ${id}: minimumVersion ${rule.minimumVersion} é maior que a versão na App Store (${storeVersion}), ex.: ${storeVersion}`,
    );
  });
  return errors;
}
