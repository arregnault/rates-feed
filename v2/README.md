# Formato v2

`v2/` publica, por cada moneda local, varias **referencias**: las tasas que la
gente usa a diario (oficial, de bolsa, informal, P2P o de mercado). Cada una
tiene un id estable, su valor actual y, si la hay, un histórico con el valor
vigente de cada día del calendario.

`v1/` sigue publicándose igual; `v2/` no lo reemplaza.

## Rutas

Base: `https://rates.apparus.app`

| Ruta                                | Contenido                                                   | Caché                                      |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `/v2/index.json`                    | Catálogo: monedas, referencias y desde cuándo hay histórico | 1 hora                                     |
| `/v2/{moneda}/latest.json`          | Valor actual de cada referencia de la moneda                | 2 min                                      |
| `/v2/{moneda}/history/AAAA-MM.json` | Valor vigente de cada referencia, día por día               | 15 min el mes en curso, 1 año los cerrados |

`{moneda}` es el código ISO 4217 en minúsculas (`ves`, `ars`). Una ruta sin datos
responde 404.

## Monedas y referencias

Las fechas se leen en la zona de cada moneda (campo `timeZone` del catálogo).

**VES, bolívar** (`America/Caracas`)

| Id             | Nombre    | Tipo       | 1 unidad de | Histórico desde                                        |
| -------------- | --------- | ---------- | ----------- | ------------------------------------------------------ |
| `ves.bcv`      | Dólar BCV | `official` | USD         | 2023-01-03                                             |
| `ves.bcv_eur`  | Euro BCV  | `official` | EUR         | 2023-01-03                                             |
| `ves.usdt_p2p` | USDT P2P  | `p2p`      | USDT        | 2026-02-14 (medido en P2P desde 2026-10-21; ver abajo) |

**ARS, peso argentino** (`America/Argentina/Buenos_Aires`)

| Id              | Nombre          | Tipo       | 1 unidad de | Histórico desde |
| --------------- | --------------- | ---------- | ----------- | --------------- |
| `ars.official`  | Dólar oficial   | `official` | USD         | 2023-01-01      |
| `ars.wholesale` | Dólar mayorista | `official` | USD         | 2023-01-01      |
| `ars.mep`       | Dólar MEP       | `exchange` | USD         | 2023-01-01      |
| `ars.ccl`       | Dólar CCL       | `exchange` | USD         | 2023-01-01      |
| `ars.blue`      | Dólar blue      | `informal` | USD         | 2023-01-01      |
| `ars.crypto`    | Dólar cripto    | `market`   | USD         | 2023-02-07      |
| `ars.card`      | Dólar tarjeta   | `official` | USD         | 2023-01-01      |

En Argentina `value` es el precio de venta (el que se suele citar) y, cuando
la fuente lo da, `bid` es el de compra y `ask` el de venta. Se actualizan una
vez por hora. El histórico guarda el valor de venta de cada día.

Cada valor es cuántas unidades de la moneda local vale una unidad de la base:
`ves.bcv` = 899,27 significa 1 USD = 899,27 VES. Los valores son texto con
decimales exactos, para no perder precisión al leerlos como número.

Los tipos son `official` (banco central o tasa oficial), `exchange` (bolsa),
`informal` (mercado paralelo o de calle), `p2p` (anuncios de compra y venta
de USDT entre personas) y `market` (tipo de cambio de mercado de referencia).

**Histórico del P2P:** ninguna fuente pública guarda el precio P2P de días
pasados, así que el histórico de `ves.usdt_p2p` existe desde que este feed lo
captura (2026-10-21). Entre 2026-02-14 y 2026-10-20 se usa el «paralelo» de
ve.dolarapi.com, que sigue al P2P de cerca, y cada día lo indica en `source`
(`dolarapi-paralelo`).

## `latest.json`

```json
{
  "schemaVersion": 2,
  "currency": "VES",
  "updatedAt": "2026-11-10T22:45:08.709Z",
  "references": [
    {
      "id": "ves.bcv",
      "value": "899.2705",
      "since": "2026-11-10",
      "source": "bcv",
      "fetchedAt": "2026-11-10T22:45:08.709Z",
      "next": { "value": "901.6175", "since": "2026-11-11" }
    },
    {
      "id": "ves.usdt_p2p",
      "value": "1082.5",
      "since": "2026-11-10",
      "source": "bybit-p2p",
      "fetchedAt": "2026-11-10T22:45:08.709Z",
      "bid": "1075.8",
      "ask": "1089.2"
    }
  ]
}
```

- `since`: fecha (en la zona de la moneda) desde la que rige el valor.
- `source`: la fuente de la que salió el valor; si no es la principal, vino
  de un respaldo.
- `fetchedAt`: cuándo se leyó. Si todas las fuentes de una referencia fallan,
  conserva su último valor y su `fetchedAt` antiguo, así que un `fetchedAt`
  viejo significa dato desactualizado.
- `bid` y `ask`: el precio de compra y el de venta, cuando la fuente da los
  dos. En P2P son la mediana de los primeros anuncios de compra (`bid`, lo que
  ofrecen quienes compran) y de venta (`ask`, lo que piden quienes venden), y
  `value` es su promedio; en Argentina, `value` es el de venta.
- `next`: un valor ya publicado para una fecha posterior (el BCV publica cada
  tarde de día hábil la tasa del siguiente). Al llegar esa fecha pasa a ser
  el valor actual.

## `history/AAAA-MM.json`

```json
{
  "schemaVersion": 2,
  "currency": "VES",
  "month": "2026-11",
  "days": {
    "2026-11-07": {
      "ves.bcv": { "value": "887.42", "since": "2026-11-06" },
      "ves.usdt_p2p": { "value": "1071.3", "since": "2026-11-07", "source": "bybit-p2p" }
    }
  }
}
```

Hay una entrada por **cada día del calendario**, hasta hoy en el mes en
curso. Para buscar la tasa de una fecha basta leer ese día:

- Si la fuente publicó ese día, `since` es el mismo día.
- Si no publicó (fin de semana, feriado), queda el valor vigente del último
  día en que publicó, y `since` dice cuál fue. En el ejemplo, el sábado 7 usa
  el BCV del viernes 6.
- Una referencia sin valor aún ese día no aparece.

Un valor publicado para mañana no entra en el histórico hasta que llegue su
fecha; mientras tanto está en `next` de `latest.json`.

Antes de la fecha «histórico desde» del catálogo no hay datos de esa
referencia: quien la consuma debería ofrecerla solo para fechas desde
entonces, o solo para hoy si el catálogo dice `null`.

## Uso razonable

Las respuestas llevan `cache-control`; respetarlo basta. Para el día actual,
`latest.json` cada pocos minutos; los meses cerrados no cambian y se pueden
guardar para siempre.

## Fuentes y atribución

Los valores vienen de fuentes de terceros (ver la tabla de fuentes en el
README del repositorio), cada una con sus condiciones. dolarapi.com pide que
toda publicación que use sus datos lo cite: «DolarApi https://dolarapi.com».
