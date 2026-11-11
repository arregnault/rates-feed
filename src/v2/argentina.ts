import type { JsonClient } from '../http';
import {
  ARGENTINA_HOUSES,
  ArgentinaDatosDay,
  DolarApiArgentina,
  readArgentinaDatosHistory,
  type ArgentinaHouse,
} from '../sources/argentina';
import { HISTORY_FROM, REFERENCE_IDS, UTC_OFFSET_HOURS } from './catalog';
import type { CurrencyFeed } from './feed';
import type { SparseDays } from './history';

const ID_BY_HOUSE: Record<ArgentinaHouse, string> = {
  oficial: REFERENCE_IDS.arsOfficial,
  mayorista: REFERENCE_IDS.arsWholesale,
  bolsa: REFERENCE_IDS.arsMep,
  contadoconliqui: REFERENCE_IDS.arsCcl,
  blue: REFERENCE_IDS.arsBlue,
  cripto: REFERENCE_IDS.arsCrypto,
  tarjeta: REFERENCE_IDS.arsCard,
};

/** dolarapi asks for about one read every few hours per series; once an hour keeps the blue current. */
const ARGENTINA_EVERY_MINUTES = 60;

export function argentinaFeed(http: JsonClient, now: () => Date): CurrencyFeed {
  return {
    utcOffsetHours: UTC_OFFSET_HOURS.ARS,
    group: {
      currency: 'ARS',
      everyMinutes: ARGENTINA_EVERY_MINUTES,
      chains: ARGENTINA_HOUSES.map((house) => ({
        id: ID_BY_HOUSE[house],
        sources: [new DolarApiArgentina(http, house), new ArgentinaDatosDay(http, house, now)],
      })),
    },
    backfill: ARGENTINA_HOUSES.map((house) => ({
      key: `ars:${house}`,
      load: async (): Promise<SparseDays> => {
        const days: SparseDays = {};
        for (const { date, value } of await readArgentinaDatosHistory(http, house, HISTORY_FROM)) {
          days[date] = { [ID_BY_HOUSE[house]]: { value, source: 'argentinadatos' } };
        }
        return days;
      },
    })),
  };
}
