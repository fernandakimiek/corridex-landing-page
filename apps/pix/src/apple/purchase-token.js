// Token de compra externa da Apple (`t`), que o app iOS manda na primeira visita.
// É base64 (ou base64url) de um JSON; aqui só se lê e confere, sem assinatura.

export const APPLE_APP = { bundleId: 'br.com.bdk.CorridexApp', appAppleId: '6756681755' };

const MAX_RAW = 4096;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Folga para relógio adiantado do aparelho.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const isTime = (v) => typeof v === 'number' && Number.isFinite(v);
const isText = (v) => typeof v === 'string' && v.length > 0;

function parse(raw) {
  let b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  b64 = b64.replace(/=+$/, '');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

// Token decodificado e válido agora, ou null (nunca lança).
export function decodePurchaseToken(raw, expected, nowMs) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RAW) return null;
  const p = parse(raw);
  if (!p || typeof p !== 'object') return null;
  if (p.bundleId !== expected.bundleId) return null;
  if ((typeof p.appAppleId !== 'string' && typeof p.appAppleId !== 'number') || String(p.appAppleId) !== expected.appAppleId) return null;
  if (!isText(p.externalPurchaseId) || !isText(p.tokenType) || !isTime(p.tokenCreationDate)) return null;
  if (p.tokenExpirationDate !== undefined && !isTime(p.tokenExpirationDate)) return null;

  const creationDate = p.tokenCreationDate;
  const expirationDate = p.tokenExpirationDate ?? creationDate + DEFAULT_TTL_MS;
  if (nowMs >= expirationDate || creationDate > nowMs + CLOCK_SKEW_MS) return null;
  return {
    externalPurchaseId: p.externalPurchaseId,
    tokenType: p.tokenType,
    environment: p.externalPurchaseId.startsWith('SANDBOX') ? 'Sandbox' : 'Production',
    creationDate,
    expirationDate,
  };
}
