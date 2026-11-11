import type { IndexDocument } from './model';

export const REFERENCE_IDS = {
  vesBcv: 'ves.bcv',
  vesBcvEur: 'ves.bcv_eur',
  vesUsdtP2p: 'ves.usdt_p2p',
} as const;

export const INDEX: IndexDocument = {
  schemaVersion: 2,
  currencies: [
    {
      code: 'VES',
      name: 'Bolívar',
      references: [
        {
          id: REFERENCE_IDS.vesBcv,
          name: 'Dólar BCV',
          kind: 'official',
          base: 'USD',
          historyFrom: '2023-01-03',
        },
        {
          id: REFERENCE_IDS.vesBcvEur,
          name: 'Euro BCV',
          kind: 'official',
          base: 'EUR',
          historyFrom: '2023-01-03',
        },
        {
          id: REFERENCE_IDS.vesUsdtP2p,
          name: 'USDT P2P',
          kind: 'p2p',
          base: 'USDT',
          historyFrom: '2026-02-14',
          measuredFrom: '2026-10-21',
        },
      ],
    },
  ],
};
