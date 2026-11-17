import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkAgainstStore, MAX_POLICY_BYTES, validatePolicy } from './app-update-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadJson(relativePath) {
  const raw = readFileSync(join(root, relativePath));
  return { doc: JSON.parse(raw.toString('utf8')), byteLength: raw.byteLength };
}

function rule(overrides = {}) {
  return {
    id: '2026-11-leitura-uber',
    level: 'recommended',
    minimumVersion: '2.0.55',
    reason: 'offerReading',
    ...overrides,
  };
}

function policy(rules) {
  return { schemaVersion: 1, rules };
}

describe('arquivos publicados e exemplos', () => {
  it('aceita app-update/v1.json sem regras', () => {
    const { doc, byteLength } = loadJson('app-update/v1.json');
    assert.equal(doc.schemaVersion, 1);
    assert.deepEqual(doc.rules, []);
    assert.deepEqual(validatePolicy(doc, { byteLength }), []);
  });

  it('aceita cada receita em policy-examples/', () => {
    const names = readdirSync(join(root, 'policy-examples')).filter((name) => name.endsWith('.json')).sort();
    assert.deepEqual(names, [
      'r1-recomendar.json',
      'r2-obrigatoria-prazo.json',
      'r3-adiar-prazo.json',
      'r4-bloquear-agora.json',
      'r5-subir-versao.json',
      'r6-duas-faixas.json',
      'r7-desfazer.json',
      'r8-limpar.json',
      'r9-vazio.json',
    ]);
    for (const name of names) {
      const { doc, byteLength } = loadJson(join('policy-examples', name));
      assert.deepEqual(validatePolicy(doc, { byteLength }), [], name);
    }
  });

  it('aceita o arquivo sem regras e cada exemplo da seção 4.1', () => {
    const examples = [
      policy([]),
      policy([rule()]),
      policy([
        rule({
          id: '2026-12-falha-historico',
          level: 'required',
          reason: 'dataSafety',
          enforcedFrom: '2026-12-01T03:00:00Z',
        }),
      ]),
      policy([
        rule({
          id: '2026-12-falha-historico',
          level: 'required',
          reason: 'dataSafety',
        }),
      ]),
    ];
    for (const example of examples) {
      assert.deepEqual(validatePolicy(example), []);
    }
  });

  it('aceita campo desconhecido no objeto e na regra', () => {
    const doc = policy([rule({ futureFlag: true })]);
    doc.note = 'ignorado pelo app';
    assert.deepEqual(validatePolicy(doc), []);
  });
});

describe('erros de política', () => {
  it('recusa id duplicado', () => {
    const errors = validatePolicy(policy([rule(), rule({ reason: 'general' })]));
    assert.ok(errors.some((error) => error.includes('regra 2026-11-leitura-uber') && error.includes('id está repetido')));
  });

  it('recusa versão 2.0.x', () => {
    const errors = validatePolicy(policy([rule({ minimumVersion: '2.0.x' })]));
    assert.ok(errors.some((error) => error.includes('minimumVersion') && error.includes('2.0.55')));
  });

  it('recusa enforcedFrom sem Z', () => {
    const errors = validatePolicy(
      policy([
        rule({
          id: '2026-12-falha-historico',
          level: 'required',
          reason: 'dataSafety',
          enforcedFrom: '2026-12-01T00:00:00-03:00',
        }),
      ]),
    );
    assert.ok(
      errors.some((error) => error === 'regra 2026-12-falha-historico: enforcedFrom precisa estar em UTC e terminar em Z, ex.: 2026-12-01T03:00:00Z'),
    );
  });

  it('recusa enforcedFrom em recommended', () => {
    const errors = validatePolicy(policy([rule({ enforcedFrom: '2026-12-01T03:00:00Z' })]));
    assert.ok(errors.some((error) => error.includes('enforcedFrom') && error.includes('required')));
  });

  it('recusa nível desconhecido', () => {
    const errors = validatePolicy(policy([rule({ level: 'blocking' })]));
    assert.ok(errors.some((error) => error.includes('level precisa ser "recommended" ou "required"')));
  });

  it('recusa mais de 20 regras', () => {
    const rules = Array.from({ length: 21 }, (_, index) =>
      rule({ id: `2026-11-regra-${String(index).padStart(2, '0')}` }),
    );
    const errors = validatePolicy(policy(rules));
    assert.ok(errors.some((error) => error.includes('no máximo 20')));
  });

  it('recusa arquivo maior que 16 KB e aceita o limite exato', () => {
    const doc = policy([]);
    assert.deepEqual(validatePolicy(doc, { byteLength: MAX_POLICY_BYTES }), []);
    const errors = validatePolicy(doc, { byteLength: MAX_POLICY_BYTES + 1 });
    assert.deepEqual(errors, [`o arquivo tem ${MAX_POLICY_BYTES + 1} bytes e o limite é ${MAX_POLICY_BYTES}`]);
  });
});

describe('checkAgainstStore', () => {
  const recommended = policy([rule({ minimumVersion: '2.0.58' })]);
  const required = policy([
    rule({ id: '2026-12-falha-historico', level: 'required', minimumVersion: '2.0.58', reason: 'dataSafety' }),
  ]);

  it('aceita os dois níveis quando a loja está acima ou igual à versão exigida', () => {
    assert.deepEqual(checkAgainstStore(recommended, '2.0.60'), []);
    assert.deepEqual(checkAgainstStore(required, '2.0.60'), []);
    assert.deepEqual(checkAgainstStore(recommended, '2.0.58'), []);
    assert.deepEqual(checkAgainstStore(required, '2.0.58'), []);
  });

  it('recusa os dois níveis quando a versão exigida está acima da loja', () => {
    const recommendedErrors = checkAgainstStore(recommended, '2.0.55');
    const requiredErrors = checkAgainstStore(required, '2.0.55');
    assert.equal(recommendedErrors.length, 1);
    assert.match(recommendedErrors[0], /regra 2026-11-leitura-uber: minimumVersion 2\.0\.58 é maior que a versão na App Store \(2\.0\.55\)/);
    assert.equal(requiredErrors.length, 1);
    assert.match(requiredErrors[0], /regra 2026-12-falha-historico: minimumVersion 2\.0\.58/);
  });
});
