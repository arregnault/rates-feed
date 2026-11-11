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
  dolarApiArgentina: 'https://dolarapi.com/v1/dolares',
  dolarApiEuros: 'https://ve.dolarapi.com/v1/euros',
  dolarApiDollarHistory: 'https://ve.dolarapi.com/v1/historicos/dolares',
  dolarApiEuroHistory: 'https://ve.dolarapi.com/v1/historicos/euros',
  openErApi: 'https://open.er-api.com/v6/latest/USD',
  bybitP2p: 'https://api2.bybit.com/fiat/otc/item/online',
  yadio: 'https://api.yadio.io/exrates/USD',
  currencyApi:
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
} as const;

export function okxP2pUrl(currency: string, side: 'sell' | 'buy'): string {
  return `https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=${currency}&baseCurrency=USDT&side=${side}&paymentMethod=all&userType=all`;
}

const ARGENTINA_DATOS = 'https://api.argentinadatos.com/v1/cotizaciones/dolares';

export const ARGENTINA_DATOS_URLS = {
  day: (house: string, date: string) => `${ARGENTINA_DATOS}/${house}/${date.replaceAll('-', '/')}`,
  history: (house: string) => `${ARGENTINA_DATOS}/${house}`,
};

export const OFFICIAL_URLS = {
  trm: (from: string) =>
    `https://www.datos.gov.co/resource/32sa-8pi3.json?$where=vigenciadesde>='${from}'&$order=vigenciadesde ASC&$limit=5000`,
  mindicadorDollar: 'https://mindicador.cl/api/dolar',
  mindicadorYear: (year: number) => `https://mindicador.cl/api/dolar/${year}`,
  ptax: (from: string, to: string) =>
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)?@i='${usDate(from)}'&@f='${usDate(to)}'&$format=json`,
  bcrpSbs: (from: string, to: string) =>
    `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/${from}/${to}`,
  dolarApiMexico: 'https://mx.dolarapi.com/v1/cotizaciones',
  currencyApiOn: (date: string) =>
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`,
};

/** MM-DD-YYYY, the date format of the Banco Central do Brasil API. */
function usDate(date: string): string {
  return `${date.slice(5, 7)}-${date.slice(8, 10)}-${date.slice(0, 4)}`;
}
