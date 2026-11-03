import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(args) {
  return spawnSync(process.execPath, ['scripts/validate-app-update.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('scripts/validate-app-update.mjs', () => {
  it('aceita app-update/v1.json', () => {
    const result = run(['app-update/v1.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /app-update\/v1\.json ok/);
  });

  it('recusa JSON inválido', () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-update-'));
    const file = join(dir, 'quebrado.json');
    try {
      writeFileSync(file, '{');
      const result = run([file]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /não é um JSON válido/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recusa arquivo acima de 16 KB citando o limite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-update-'));
    const file = join(dir, 'grande.json');
    try {
      writeFileSync(
        file,
        JSON.stringify({ schemaVersion: 1, rules: [], padding: 'a'.repeat(17 * 1024) }),
      );
      const result = run([file]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /o limite é 16384/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
