// Regras do pedido Pix: reserva de código, cobrança, pagamento, vencimento e nova cobrança.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TXID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function newTxid() {
  let out = '';
  while (out.length < 25) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      // 248 = 62 * 4: descarta o resto para não enviesar o alfabeto.
      if (b < 248 && out.length < 25) out += TXID_ALPHABET[b % 62];
    }
  }
  return out;
}

const AVAILABILITY_REASON = {
  out_of_stock: 'plan_out_of_stock',
  unavailable_for_customer: 'unavailable_for_customer',
};

export function createOrderService({ provider, stores, plans, now, pixTtlSeconds = 1800 }) {
  const { orders, codes } = stores;

  // Reserva um código e abre uma cobrança. Nunca cobra sem ter código reservado.
  async function reserveAndCharge(token, planId, email, amountCents) {
    const availability = codes.availability(planId, email);
    if (availability !== 'ok') return { ok: false, reason: AVAILABILITY_REASON[availability] ?? 'plan_out_of_stock' };
    if (!codes.reserve(planId, email, token)) return { ok: false, reason: 'plan_out_of_stock' };
    const txid = newTxid();
    try {
      const charge = await provider.createCharge({ txid, amountCents, expiresInSeconds: pixTtlSeconds });
      return { ok: true, txid, copiaECola: charge.copiaECola, expiresAt: charge.expiresAt };
    } catch {
      codes.release(token);
      return { ok: false, reason: 'pix_unavailable' };
    }
  }

  async function isPaid(order) {
    for (const txid of order.txids) {
      const charge = await provider.getCharge(txid);
      if (charge && charge.status === 'CONCLUIDA' && charge.amountCents === order.amountCents) return true;
    }
    return false;
  }

  async function sync(order) {
    if (order.status === 'delivered' || order.status === 'pending') return order;
    if (await isPaid(order)) {
      const code = codes.claim(order.token, order.planId, order.email);
      return orders.update(order.token, {
        status: code ? 'delivered' : 'pending',
        code: code ? { ...code } : null,
        paidAt: now(),
      });
    }
    if (order.status === 'paying' && now() >= order.expiresAt) {
      codes.release(order.token);
      return orders.update(order.token, { status: 'expired' });
    }
    return order;
  }

  return {
    async create({ planId, email: rawEmail }) {
      const plan = Object.hasOwn(plans, planId) ? plans[planId] : null;
      if (!plan) return { ok: false, reason: 'invalid_plan' };
      const email = normalizeEmail(rawEmail);
      if (!email) return { ok: false, reason: 'invalid_email' };

      const active = orders.findActive(email, planId);
      if (active) {
        if (now() < active.expiresAt) return { ok: true, order: active };
        await sync(active); // vencido: libera a reserva antes de tentar de novo
      }

      const token = newToken();
      const r = await reserveAndCharge(token, planId, email, plan.amountCents);
      if (!r.ok) return r;
      const order = {
        token,
        planId,
        email,
        amountCents: plan.amountCents,
        txids: [r.txid],
        copiaECola: r.copiaECola,
        expiresAt: r.expiresAt,
        status: 'paying',
        code: null,
        paidAt: null,
        createdAt: now(),
      };
      orders.insert(order);
      return { ok: true, order: orders.get(token) };
    },

    async get(token) {
      const order = orders.get(token);
      return order ? sync(order) : null;
    },

    async renew(token) {
      const existing = orders.get(token);
      if (!existing) return { ok: false, reason: 'not_found' };
      const order = await sync(existing);
      if (order.status !== 'expired') return { ok: false, reason: 'not_expired' };
      const r = await reserveAndCharge(token, order.planId, order.email, order.amountCents);
      if (!r.ok) return r;
      const updated = orders.update(token, {
        status: 'paying',
        txids: [...order.txids, r.txid],
        copiaECola: r.copiaECola,
        expiresAt: r.expiresAt,
      });
      return { ok: true, order: updated };
    },
  };
}
