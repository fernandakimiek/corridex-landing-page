// Provedor Pix simulado: só para desenvolvimento (PIX_DEV_TOOLS=true). Nada é cobrado de verdade.
import { buildBrCode } from './brcode.js';

export function createMockPixProvider({ devTools, now }) {
  if (!devTools) throw new Error('mock provider exige PIX_DEV_TOOLS=true');
  const charges = new Map();

  return {
    async createCharge({ txid, amountCents, expiresInSeconds }) {
      const copiaECola = buildBrCode({
        key: 'teste@corridex.app',
        name: 'CORRIDEX',
        city: 'SAO PAULO',
        amountCents,
        txid,
        description: 'TESTE - NAO PAGUE',
      });
      const expiresAt = now() + expiresInSeconds * 1000;
      charges.set(txid, { status: 'ATIVA', amountCents, expiresAt });
      return { copiaECola, expiresAt };
    },
    async getCharge(txid) {
      const c = charges.get(txid);
      return c ? { status: c.status, amountCents: c.amountCents } : null;
    },
    markPaid(txid) {
      const c = charges.get(txid);
      if (c) c.status = 'CONCLUIDA';
    },
  };
}
