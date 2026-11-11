import type { IndexDocument, Reference } from './model';

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

export const TIME_ZONES = {
  VES: 'America/Caracas',
  ARS: 'America/Argentina/Buenos_Aires',
  BOB: 'America/La_Paz',
  BRL: 'America/Sao_Paulo',
  CLP: 'America/Santiago',
  COP: 'America/Bogota',
  CRC: 'America/Costa_Rica',
  DOP: 'America/Santo_Domingo',
  MXN: 'America/Mexico_City',
  PEN: 'America/Lima',
  PYG: 'America/Asuncion',
  UYU: 'America/Montevideo',
} as const;

export type CurrencyCode = keyof typeof TIME_ZONES;

/** Local currencies whose USDT P2P market the feed reads, besides the bolivar from v1. */
export const P2P_CURRENCIES = [
  'ARS',
  'BOB',
  'BRL',
  'CLP',
  'COP',
  'CRC',
  'DOP',
  'MXN',
  'PEN',
  'PYG',
  'UYU',
] as const satisfies readonly CurrencyCode[];

export function p2pId(currency: CurrencyCode): string {
  return `${currency.toLowerCase()}.usdt_p2p`;
}

/** No public source keeps past P2P prices: the history of these starts when the feed began. */
const P2P_HISTORY_FROM = '2026-11-11';

const CURRENCY_NAMES: Record<Exclude<(typeof P2P_CURRENCIES)[number], 'ARS'>, string> = {
  BOB: 'Boliviano',
  BRL: 'Real brasileño',
  CLP: 'Peso chileno',
  COP: 'Peso colombiano',
  CRC: 'Colón costarricense',
  DOP: 'Peso dominicano',
  MXN: 'Peso mexicano',
  PEN: 'Sol peruano',
  PYG: 'Guaraní',
  UYU: 'Peso uruguayo',
};

export function timeZoneOf(code: string): string | undefined {
  return (TIME_ZONES as Record<string, string>)[code];
}

/** Every currency's history starts here, except references created later. */
export const HISTORY_FROM = '2023-01-01';

const CURATED: IndexDocument['currencies'] = [
  {
    code: 'VES',
    name: 'Bolívar',
    timeZone: TIME_ZONES.VES,
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
    timeZone: TIME_ZONES.ARS,
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
];

const P2P_REFERENCE = (currency: CurrencyCode): Reference => ({
  id: p2pId(currency),
  name: 'USDT P2P',
  kind: 'p2p',
  base: 'USDT',
  historyFrom: P2P_HISTORY_FROM,
});

/**
 * The official rate of each currency that has one source for it. Its history loads from
 * HISTORY_FROM, but starts on the first day the source published, after the new year holiday.
 */
export const OFFICIAL_REFERENCES = {
  BOB: { id: 'bob.official', name: 'Dólar oficial', historyFrom: '2023-01-02' },
  BRL: { id: 'brl.ptax', name: 'Dólar PTAX', historyFrom: '2023-01-02' },
  CLP: { id: 'clp.observed', name: 'Dólar observado', historyFrom: '2023-01-03' },
  COP: { id: 'cop.trm', name: 'TRM', historyFrom: '2023-01-04' },
  MXN: { id: 'mxn.fix', name: 'Dólar FIX', historyFrom: P2P_HISTORY_FROM },
  PEN: { id: 'pen.sbs', name: 'Dólar SBS', historyFrom: '2023-01-03' },
} as const satisfies Partial<Record<CurrencyCode, Omit<Reference, 'kind' | 'base'>>>;

/** Currencies without one official source: a market rate stands in. */
export const MARKET_CURRENCIES = [
  'CRC',
  'DOP',
  'PYG',
  'UYU',
] as const satisfies readonly CurrencyCode[];

/** The first date currency-api keeps. */
export const MARKET_HISTORY_FROM = '2024-03-02';

export function marketId(currency: CurrencyCode): string {
  return `${currency.toLowerCase()}.market`;
}

function localReference(code: Exclude<(typeof P2P_CURRENCIES)[number], 'ARS'>): Reference {
  if (code in OFFICIAL_REFERENCES) {
    return {
      ...OFFICIAL_REFERENCES[code as keyof typeof OFFICIAL_REFERENCES],
      kind: 'official',
      base: 'USD',
    };
  }
  return {
    id: marketId(code),
    name: 'Dólar de mercado',
    kind: 'market',
    base: 'USD',
    historyFrom: MARKET_HISTORY_FROM,
  };
}

/** Each currency's references, its USDT P2P last. */
export const INDEX: IndexDocument = {
  schemaVersion: 2,
  currencies: [
    ...CURATED.map((currency) =>
      currency.code === 'ARS'
        ? { ...currency, references: [...currency.references, P2P_REFERENCE('ARS')] }
        : currency,
    ),
    ...P2P_CURRENCIES.filter((code) => code !== 'ARS').map((code) => ({
      code,
      name: CURRENCY_NAMES[code],
      timeZone: TIME_ZONES[code],
      references: [localReference(code), P2P_REFERENCE(code)],
    })),
  ],
};
