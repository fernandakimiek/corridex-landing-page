export function configFromEnv(env = {}) {
  return {
    devTools: env.PIX_DEV_TOOLS === 'true',
    salesEnabled: env.PIX_SALES_ENABLED !== 'false',
    appStoreId: '6756681755',
    supportUrl: 'https://wa.me/message/ON3GNOTDII42F1',
  };
}
