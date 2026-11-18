// Fonte única de todo texto visível da página do Pix (chaves do handoff).
// Linguagem simples: ordem direta, uma ideia por linha.
// Nunca usar: token, oferta, geração, Apple ID, webhook.

export const copy = {
  brand: 'Corridex',
  // Barra de título das etapas (a escolha mostra a marca).
  nav: {
    payment: 'Pagamento',
    trial: 'Teste grátis',
    help: 'Ajuda',
  },
  choose: {
    title: 'Assine o Corridex com Pix',
    sub: 'Pagamento único. Não renova sozinho.',
  },
  plan: {
    title: 'Corridex {plano}',
    legend: 'Plano',
    summary: '{duração} de monitoramento. Não renova sozinho.',
    payOnce: 'Pix, pagamento único',
    perMonth: '{duração} · {valor}/mês',
    best: 'Mais vantajoso',
  },
  email: {
    label: 'Seu e-mail',
    help: 'Enviamos o código e a nota fiscal para este e-mail.',
    invalid: 'Confira o e-mail. Ele precisa ter @ e um domínio, como nome@email.com.',
    change: 'Usar este e-mail',
  },
  pix: {
    cta: 'Gerar Pix',
    ctaWithPrice: 'Gerar Pix · {valor}',
    copyShort: 'Copiar',
    step1: 'Copie o código acima',
    step2: 'Abra o app do seu banco',
    step3: 'Escolha Pix Copia e Cola e cole',
    showQr: 'Mostrar QR Code',
    waitingLong: 'Aguardando pagamento. Esta tela muda sozinha.',
    validShort: 'Vale até {hora} · {minutos} min',
    copy: 'Copiar código Pix',
    payTitle: 'Pague {valor} com Pix',
    copied: 'Código copiado. Cole no app do seu banco.',
    codeLabel: 'Código Pix copia e cola',
    qrHint: 'Ou leia o QR Code com outro aparelho.',
    qrAlt: 'QR Code do Pix',
    waiting: 'Aguardando pagamento…',
    validUntil: 'Vale até {hora} ({minutos} min). Pode deixar esta página aberta: ela muda sozinha quando o Pix cair.',
    refresh: 'Já paguei, atualizar',
  },
  paid: {
    title: 'Pagamento confirmado',
    next: 'Falta um toque para ativar seu acesso.',
  },
  code: {
    label: 'Seu código',
    redeem: 'Resgatar código',
    redeemStore: 'Resgatar na App Store',
    meta: 'Resgate até {data} · enviado para {email}',
    redeemHint: 'Abre a App Store com o código já preenchido.',
    sentTo: 'Também enviamos para {email}. O código vale uma vez só.',
    redeemBy: 'Resgate até {data}.',
    help: 'O código não funcionou?',
  },
  pending: {
    title: 'Seu código está a caminho',
    body: 'Ele chega por e-mail em até 2 horas. Pode fechar esta página.',
    sentTo: 'Enviaremos para {email}.',
  },
  expired: {
    title: 'Este Pix venceu',
    body: 'Gere outro, leva um segundo.',
    cta: 'Gerar novo Pix',
    hint: 'Se você já pagou, espere: a página avisa quando o pagamento for confirmado.',
  },
  down: {
    title: 'O Pix está indisponível agora',
    body: 'Tente de novo em alguns minutos ou assine pela App Store no app.',
    cta: 'Tentar de novo',
  },
  stock: {
    title: 'O {plano} está indisponível no Pix agora',
    body: 'Escolha outro plano ou assine pela App Store no app.',
    unavailableTag: 'indisponível',
  },
  customer: {
    unavailable: 'Para este e-mail, o {plano} fica disponível em algumas horas',
    unavailableBody: 'Tente mais tarde ou assine pela App Store no app.',
  },
  seeOther: 'Ver {plano}',
  paused: {
    title: 'A venda por Pix está pausada',
    body: 'Assine pela App Store no app. Quem já tem código pode resgatar normalmente.',
  },
  trial: {
    link: 'Nunca assinou? Testar 7 dias grátis',
    title: 'Testar 7 dias grátis',
    sub: 'Sem pagamento. Não renova sozinho.',
    cta: 'Liberar 7 dias grátis',
    help: 'O código aparece aqui na hora e também vai para o seu e-mail.',
    back: 'Voltar aos planos',
    delivered: '7 dias grátis liberados',
    after: 'Depois dos 7 dias, nada é cobrado.',
    used: 'Este aparelho já usou o teste grátis',
    usedBody: 'Você pode assinar por Pix ou pela App Store.',
    seePlans: 'Ver planos',
    planName: 'Teste grátis',
  },
  order: {
    title: 'Seu pedido',
    paidOn: 'Pago em {data} por Pix',
    paidOnLabel: 'Pago em',
    paidOnValue: '{data} · Pix',
  },
  help: {
    title: 'O código não funcionou?',
    account: 'Confira a conta Apple',
    accountBody: 'Use a mesma conta Apple do aparelho onde está o Corridex.',
    wait: 'Novo código pode levar 1 hora',
    waitBody: 'Se acabou de comprar, tente de novo daqui a pouco.',
    cta: 'Falar com o suporte',
    hint: 'Respondemos pelo WhatsApp. Tenha o e-mail da compra em mãos.',
    back: 'Voltar ao pedido',
  },
  notFound: {
    title: 'Pedido não encontrado',
    body: 'Confira o link do e-mail ou gere um novo Pix.',
    cta: 'Ver planos',
  },
  // Handoff: "Pagamento pelo Banco Inter · Termos · Privacidade · Ajuda"
  footer: {
    bank: 'Pagamento pelo Banco Inter',
    terms: 'Termos',
    privacy: 'Privacidade',
    help: 'Ajuda',
  },
};

// Só aparece com as ferramentas de simulação ligadas; não é texto para o cliente.
export const dev = {
  label: 'Simulação',
  catalog: 'Catálogo',
  pay: 'Simular pagamento',
  title: 'Simulação (só desenvolvimento)',
  choose: 'Escolha de plano',
  chooseMonthly: 'Escolha com plano mensal',
  scenarios: 'Cenários da escolha',
  orderScenarios: 'Cenários do pedido',
  orderHint: 'Abra qualquer página de pedido e acrescente ?cenario= com o nome abaixo (ou use os links da barra).',
  trial: 'Teste grátis',
  trialRequest: 'Teste grátis (pedir código)',
  trialUsed: 'Teste grátis já usado',
  createOrder: 'Criar pedido de exemplo (plano anual)',
  orders: 'Pedidos',
};

export const links = {
  terms: 'https://corridex.app/terms',
  privacy: 'https://corridex.app/privacy',
  help: 'https://corridex.app/support',
};

// Preenche {chave} com vars[chave]; placeholders sem valor ficam como estão.
export function t(template, vars = {}) {
  return template.replace(/\{([^{}]+)\}/g, (m, key) => (key in vars && vars[key] != null ? String(vars[key]) : m));
}
