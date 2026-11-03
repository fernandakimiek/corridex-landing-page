#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkAgainstStore, validatePolicy } from './lib/app-update-policy.mjs';

const LOOKUP_URL = 'https://itunes.apple.com/lookup?id=6756681755&country=br';

function printErrors(errors) {
  for (const error of errors) console.error(error);
}

async function fetchStoreVersion() {
  const response = await fetch(LOOKUP_URL, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json', 'User-Agent': 'corridex-app-update-validator' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.json();
  const version = body?.results?.[0]?.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('a resposta não trouxe results[0].version');
  }
  return version;
}

async function main() {
  const args = process.argv.slice(2);
  const checkStore = args.includes('--check-app-store');
  const fileArg = args.find((arg) => !arg.startsWith('--'));
  const displayPath = fileArg ?? 'app-update/v1.json';
  const file = resolve(displayPath);

  let raw;
  try {
    raw = readFileSync(file);
  } catch (error) {
    printErrors([`não foi possível ler ${displayPath}: ${error.message}`]);
    process.exit(1);
  }

  let doc;
  try {
    doc = JSON.parse(raw.toString('utf8'));
  } catch {
    printErrors([`${displayPath} não é um JSON válido`]);
    process.exit(1);
  }

  const errors = validatePolicy(doc, { byteLength: raw.byteLength });

  if (checkStore) {
    try {
      const storeVersion = await fetchStoreVersion();
      errors.push(...checkAgainstStore(doc, storeVersion));
      if (errors.length === 0) {
        console.log(`${displayPath} ok (App Store ${storeVersion})`);
        return;
      }
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      const detail = timedOut ? 'tempo esgotado (10s)' : error.cause?.message || error.message;
      errors.push(`não foi possível consultar a App Store: ${detail}`);
    }
  }

  if (errors.length > 0) {
    printErrors(errors);
    process.exit(1);
  }

  console.log(`${displayPath} ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
