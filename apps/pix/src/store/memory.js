// Lojas em memória (pedidos, códigos, testes grátis). Estado vive só enquanto o processo vive.
export function createMemoryStores({ codes: seed }) {
  const orders = new Map();
  const slots = seed.map((code) => ({ code: { ...code }, state: 'free', holderId: null }));
  const received = new Map(); // email -> Set<offerId>
  const trialKeys = new Set();

  const receivedBy = (email) => received.get(email) ?? new Set();
  const forHolder = (holderId) => slots.find((s) => s.holderId === holderId && s.state !== 'free');
  const takeFree = (planId, email) => {
    const seen = receivedBy(email);
    return slots.find((s) => s.state === 'free' && s.code.planId === planId && !seen.has(s.code.offerId));
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
      findActive(email, planId) {
        for (const o of orders.values()) {
          if (o.email === email && o.planId === planId && o.status === 'paying') return o;
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
        const slot = takeFree(planId, email);
        if (!slot) return null;
        slot.state = 'reserved';
        slot.holderId = holderId;
        return slot.code;
      },
      release(holderId) {
        const slot = forHolder(holderId);
        if (slot && slot.state === 'reserved') {
          slot.state = 'free';
          slot.holderId = null;
        }
      },
      claim(holderId, planId, email) {
        let slot = forHolder(holderId);
        if (!slot) {
          slot = takeFree(planId, email);
          if (!slot) return null;
          slot.holderId = holderId;
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
  };
}
