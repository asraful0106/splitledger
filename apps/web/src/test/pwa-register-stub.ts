export function useRegisterSW(): {
  needRefresh: [boolean, (value: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  return {
    needRefresh: [false, () => undefined],
    updateServiceWorker: async () => undefined,
  };
}
