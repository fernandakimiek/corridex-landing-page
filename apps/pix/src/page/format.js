// Formatação para a página: valores, e-mail, código, datas.

// 9990 → 'R$ 99,90' (espaço comum, não o espaço fino do Intl).
export function brl(cents) {
  const reais = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, '0');
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
}

// 'motorista@email.com' → 'm•••@email.com'
export function maskEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

// Grupos de 6 separados por espaço.
export function groupCode(value) {
  return (value.match(/.{1,6}/g) ?? []).join(' ');
}

// '2027-05-16' → '16/05/2027'
export function dateBR(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ms → 'aaaa-mm-dd' no fuso de Brasília (en-CA formata como ISO).
const isoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

// ms → 'dd/mm/aaaa' no fuso de Brasília.
export function dateBRFromMs(ms) {
  return dateBR(isoDateFmt.format(new Date(ms)));
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// ms → 'HH:MM' no horário de Brasília.
export function timeBR(ms) {
  return timeFmt.format(new Date(ms));
}

export function redeemUrl(appStoreId, code) {
  return `https://apps.apple.com/redeem?ctx=offercodes&id=${encodeURIComponent(appStoreId)}&code=${encodeURIComponent(code)}`;
}
