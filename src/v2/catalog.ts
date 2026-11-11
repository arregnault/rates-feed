import type { IndexDocument } from './model';

export const REFERENCE_IDS = {
  vesBcv: 'ves.bcv',
  vesBcvEur: 'ves.bcv_eur',
  vesUsdtP2p: 'ves.usdt_p2p',
  arsOfficial: 'ars.official',
  arsWholesale: 'ars.wholesale',
  arsMep: 'ars.mep',
  arsCcl: 'ars.ccl',
  arsBlue: 'ars.blue',
  arsCrypto: 'ars.crypto',
  arsCard: 'ars.card',
} as const;

/** Each currency's zone as a fixed offset: none of them uses daylight saving time. */
export const UTC_OFFSET_HOURS = {
  VES: -4,
  ARS: -3,
} as const;

export function utcOffsetOf(code: string): number | undefined {
  return (UTC_OFFSET_HOURS as Record<string, number>)[code];
}

/** Every currency's history starts here, except references created later. */
export const HISTORY_FROM = '2023-01-01';

export const INDEX: IndexDocument = {
  schemaVersion: 2,
  currencies: [
    {
      code: 'VES',
      name: 'Bolívar',
      timeZone: 'America/Caracas',
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
    {
      code: 'ARS',
      name: 'Peso argentino',
      timeZone: 'America/Argentina/Buenos_Aires',
      references: [
        {
          id: REFERENCE_IDS.arsOfficial,
          name: 'Dólar oficial',
          kind: 'official',
          base: 'USD',
          historyFrom: HISTORY_FROM,
        },
        {
          id: REFERENCE_IDS.arsWholesale,
          name: 'Dólar mayorista',
          kind: 'official',
          base: 'USD',
          historyFrom: HISTORY_FROM,
        },
        {
          id: REFERENCE_IDS.arsMep,
          name: 'Dólar MEP',
          kind: 'exchange',
          base: 'USD',
          historyFrom: HISTORY_FROM,
        },
        {
          id: REFERENCE_IDS.arsCcl,
          name: 'Dólar CCL',
          kind: 'exchange',
          base: 'USD',
          historyFrom: HISTORY_FROM,
        },
        {
          id: REFERENCE_IDS.arsBlue,
          name: 'Dólar blue',
          kind: 'informal',
          base: 'USD',
          historyFrom: HISTORY_FROM,
        },
        {
          id: REFERENCE_IDS.arsCrypto,
          name: 'Dólar cripto',
          kind: 'market',
          base: 'USD',
          historyFrom: '2023-02-07',
        },
        {
          id: REFERENCE_IDS.arsCard,
          name: 'Dólar tarjeta',
          kind: 'official',
          base: 'USD',
          historyFrom: HISTORY_FROM,
        },
      ],
    },
  ],
};
