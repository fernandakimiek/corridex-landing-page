// Códigos de exemplo para desenvolvimento. Não são códigos reais.
const PLAN_TAGS = { monthly: 'ME', quarterly: 'TR', annual: 'AN', teste: 'TE' };

export function seedCodes() {
  const codes = [];
  for (const [planId, tag] of Object.entries(PLAN_TAGS)) {
    for (const letter of ['A', 'B']) {
      for (let n = 1; n <= 3; n++) {
        codes.push({
          value: `EXEMP${tag}${letter}${String(n).padStart(10, '0')}`,
          planId,
          offerId: `${planId}-${letter.toLowerCase()}`,
          redeemBy: '2027-05-16',
        });
      }
    }
  }
  return codes;
}
