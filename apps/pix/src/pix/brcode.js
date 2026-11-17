// BR Code (Pix "copia e cola"): payload EMV com CRC16-CCITT-FALSE.

// CRC16-CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF, sem reflexão.
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Campo EMV: id (2) + tamanho (2, zero à esquerda) + valor.
function field(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

// Centavos inteiros → "R$" sem float: 9990 → "99.90".
function formatAmount(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function buildBrCode({ key, name, city, amountCents, txid, description }) {
  const merchantAccount =
    field('00', 'br.gov.bcb.pix') +
    field('01', key) +
    (description ? field('02', description) : '');

  const payload =
    field('00', '01') +
    field('26', merchantAccount) +
    field('52', '0000') +
    field('53', '986') +
    field('54', formatAmount(amountCents)) +
    field('58', 'BR') +
    field('59', name.slice(0, 25)) +
    field('60', city.slice(0, 15)) +
    field('62', field('05', txid.slice(0, 25))) +
    '6304';

  return payload + crc16(payload);
}
