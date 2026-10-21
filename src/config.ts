/** Foreign currencies the app can enable, published as units per US dollar. */
export const FX_CURRENCIES = [
  'ARS',
  'AUD',
  'BOB',
  'BRL',
  'CAD',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'DOP',
  'EUR',
  'GBP',
  'GTQ',
  'HNL',
  'JPY',
  'MXN',
  'NIO',
  'PAB',
  'PEN',
  'PYG',
  'TRY',
  'UYU',
] as const;

export const URLS = {
  dolarApiDollars: 'https://ve.dolarapi.com/v1/dolares',
  dolarApiEuros: 'https://ve.dolarapi.com/v1/euros',
  dolarApiDollarHistory: 'https://ve.dolarapi.com/v1/historicos/dolares',
  dolarApiEuroHistory: 'https://ve.dolarapi.com/v1/historicos/euros',
  openErApi: 'https://open.er-api.com/v6/latest/USD',
  criptoYa: 'https://criptoya.com/api/binancep2p/USDT/VES/1',
  binanceP2p: 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
  yadio: 'https://api.yadio.io/exrates/USD',
  currencyApi:
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
} as const;
