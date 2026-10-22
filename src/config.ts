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
  bcvSecure: 'https://www.bcv.org.ve/',
  bcvPlain: 'http://www.bcv.org.ve/',
  dolarApiDollars: 'https://ve.dolarapi.com/v1/dolares',
  dolarApiEuros: 'https://ve.dolarapi.com/v1/euros',
  dolarApiDollarHistory: 'https://ve.dolarapi.com/v1/historicos/dolares',
  dolarApiEuroHistory: 'https://ve.dolarapi.com/v1/historicos/euros',
  openErApi: 'https://open.er-api.com/v6/latest/USD',
  bybitP2p: 'https://api2.bybit.com/fiat/otc/item/online',
  okxP2pSell:
    'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=VES&baseCurrency=USDT&side=sell&paymentMethod=all&userType=all',
  okxP2pBuy:
    'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=VES&baseCurrency=USDT&side=buy&paymentMethod=all&userType=all',
  yadio: 'https://api.yadio.io/exrates/USD',
  currencyApi:
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
} as const;
