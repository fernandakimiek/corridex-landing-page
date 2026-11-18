import { randomId } from '../orders.js';

// Lojas em memória (pedidos, códigos, testes grátis e suas sessões, tokens da Apple). Estado vive só enquanto o processo vive.
export function createMemoryStores({ codes: seed }) {
  const orders = new Map();
  const slots = seed.map((code) => ({ code: { ...code }, state: 'free', holderId: null, email: null }));
  const received = new Map(); // email -> Set<offerId>
  const trialKeys = new Set();
  const trialSessionsById = new Map();
  const tokensById = new Map();
  const tokenIdByPurchase = new Map(); // externalPurchaseId -> id

  const receivedBy = (email) => received.get(email) ?? new Set();
  const forHolder = (holderId) => slots.find((s) => s.holderId === holderId && s.state !== 'free');
  // Ofertas que o e-mail não pode receber: já recebidas ou já reservadas para ele por outro holder.
  const blockedOffers = (email, holderId) => {
    const blocked = new Set(receivedBy(email));
    for (const s of slots) {
      if (s.state === 'reserved' && s.email === email && s.holderId !== holderId) blocked.add(s.code.offerId);
    }
    return blocked;
  };
  const takeFree = (planId, email, holderId) => {
    const blocked = blockedOffers(email, holderId);
    return slots.find((s) => s.state === 'free' && s.code.planId === planId && !blocked.has(s.code.offerId));
  };

  return {
    orders: {
      insert(order) {
        orders.set(order.token, { ...order });
      },
      get(token) {
        return orders.get(token) ?? null;
      },
      update(token, patch) {
        const current = orders.get(token);
        if (!current) throw new Error('pedido desconhecido');
        const next = { ...current, ...patch };
        orders.set(token, next);
        return next;
      },
      // Com `nonce`, só o pedido aberto pelo mesmo formulário.
      findActive(email, planId, nonce) {
        for (const o of orders.values()) {
          if (o.email === email && o.planId === planId && o.status === 'paying'
            && (nonce === undefined || o.nonce === nonce)) return o;
        }
        return null;
      },
    },
    codes: {
      availability(planId, email) {
        const free = slots.filter((s) => s.state === 'free' && s.code.planId === planId);
        if (free.length === 0) return 'out_of_stock';
        return takeFree(planId, email) ? 'ok' : 'unavailable_for_customer';
      },
      reserve(planId, email, holderId) {
        const existing = forHolder(holderId);
        if (existing) return existing.code;
        const slot = takeFree(planId, email, holderId);
        if (!slot) return null;
        slot.state = 'reserved';
        slot.holderId = holderId;
        slot.email = email;
        return slot.code;
      },
      release(holderId) {
        const slot = forHolder(holderId);
        if (slot && slot.state === 'reserved') {
          slot.state = 'free';
          slot.holderId = null;
          slot.email = null;
        }
      },
      claim(holderId, planId, email) {
        let slot = forHolder(holderId);
        if (!slot) {
          slot = takeFree(planId, email, holderId);
          if (!slot) return null;
          slot.holderId = holderId;
          slot.email = email;
        }
        if (slot.state !== 'delivered') {
          slot.state = 'delivered';
          if (!received.has(email)) received.set(email, new Set());
          received.get(email).add(slot.code.offerId);
        }
        return slot.code;
      },
    },
    trials: {
      used: (deviceKey) => trialKeys.has(deviceKey),
      mark: (deviceKey) => void trialKeys.add(deviceKey),
    },
    // Sessão do teste grátis aberta pelo link do app; o cookie guarda só o `id`.
    trialSessions: {
      create({ deviceKey, markToken, expiresAt }) {
        const id = randomId();
        trialSessionsById.set(id, { deviceKey, markToken, expiresAt });
        return id;
      },
      // Vencida (nowMs >= expiresAt) conta como inexistente e é descartada.
      get(id, nowMs) {
        const session = trialSessionsById.get(id);
        if (!session) return null;
        if (nowMs >= session.expiresAt) {
          trialSessionsById.delete(id);
          return null;
        }
        return { ...session };
      },
      delete: (id) => void trialSessionsById.delete(id),
    },
    // Token da Apple já decodificado; o cookie guarda só o `id`.
    tokens: {
      remember(decoded) {
        let id = tokenIdByPurchase.get(decoded.externalPurchaseId);
        if (!id) {
          id = randomId();
          tokenIdByPurchase.set(decoded.externalPurchaseId, id);
          tokensById.set(id, { ...decoded, id });
        }
        return { id };
      },
      byId: (id) => tokensById.get(id) ?? null,
    },
  };
}
