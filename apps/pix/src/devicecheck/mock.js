// DeviceCheck simulado (devTools e testes): a chave do aparelho é o próprio `dcq`.
// O DeviceCheck de verdade lê/marca os bits da Apple; a interface é a mesma.
export function createMockDeviceCheck({ trials }) {
  return {
    async isUsed(dcq) {
      return trials.used(dcq);
    },
    async mark(deviceKey, _dcm) {
      trials.mark(deviceKey);
    },
  };
}
