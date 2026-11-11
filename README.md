# rates-feed

Worker de Cloudflare que recolecta tasas de cambio desde fuentes públicas, con
respaldos, y las publica como JSON estático en `rates.apparus.app`. Guarda los
documentos en Workers KV y los sirve él mismo, con la caché de Cloudflare
delante; todo dentro del plan gratuito y sin método de pago.

## Qué publica

| Ruta                      | Contenido                                                                                                                                                                    | Caché                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `v1/latest.json`          | Tasas actuales: BCV dólar y euro (y los del siguiente día hábil, si ya se publicaron), USDT y monedas extra por dólar, cada una con fuente, fecha efectiva y hora de captura | 2 min                                      |
| `v1/history/AAAA-MM.json` | Cierre de cada día del mes                                                                                                                                                   | 15 min el mes en curso, 1 año los cerrados |
| `v2/...`                  | Varias referencias por moneda local, con histórico de cada día del calendario: ver [`v2/README.md`](v2/README.md)                                                            | Según la ruta                              |

Se ejecuta cada 5 minutos, porque el USDT cambia a lo largo del día.
`v1/latest.json` se reescribe en cada ejecución; el mes en curso, una vez por
hora y en la última ejecución del día de Caracas, para no gastar la cuota
diaria de escrituras de KV en un documento que guarda un valor por día. El
progreso de la carga inicial del histórico se guarda en `v1/meta/backfill.json`,
que no se publica. Si todas
las fuentes de un dato fallan, ese dato conserva su último valor y su
`fetchedAt` antiguo, para que quien lo consuma sepa que está desactualizado.

Un valor que no es positivo, o que se aleja más de un 30 % del último
publicado, cuenta como fallo de esa fuente y se prueba la siguiente. Un
movimiento así solo se publica si otra fuente lo confirma con una diferencia de
menos del 5 %; así una fuente rota no publica un valor absurdo y un cambio real
grande sigue entrando.

El BCV publica cada tarde de día hábil la tasa del siguiente día hábil (un
viernes, la del lunes). Una lectura con fecha valor posterior a hoy (en
Caracas) se publica como `bcvUsdNext` o `bcvEurNext`, y la tasa actual sale del
resto de fuentes o conserva su valor. Al llegar esa fecha valor pasa a ser la
actual y el campo vuelve a `null`. Los dos campos son nuevos y opcionales en
`v1/`: quien no los conozca los ignora.

La página del BCV se lee por HTTPS. Si la conexión falla (por ejemplo, por un
certificado vencido), se intenta por HTTP; como esa lectura no está autenticada
y alguien en el camino podría alterarla, solo se acepta si está a menos de un
5 % del último valor publicado.

## Fuentes

| Dato           | Orden                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BCV dólar      | bcv.org.ve (con su fecha valor), ve.dolarapi.com, open.er-api.com                                                                                      |
| BCV euro       | bcv.org.ve, ve.dolarapi.com, cruce aproximado de open.er-api.com (no entra al histórico)                                                               |
| USDT           | Bybit P2P, OKX P2P (en ambos, promedio de la mediana de los primeros 10 anuncios de compra y de venta), api.yadio.io, paralelo de ve.dolarapi.com      |
| Monedas extra  | currency-api (jsDelivr), open.er-api.com, api.yadio.io                                                                                                 |
| Argentina      | dolarapi.com (las siete casas en una petición, una vez por hora), ArgentinaDatos (el día de hoy)                                                       |
| USDT P2P (v2)  | Bybit P2P, OKX P2P (solo OKX en CRC), cada 15 minutos: ARS, BRL, CLP, COP, CRC, DOP, MXN, PEN, PYG y UYU                                               |
| Oficiales (v2) | Una vez por hora: PTAX (olinda.bcb.gov.br), dólar observado (mindicador.cl), TRM (datos.gov.co), SBS (estadisticas.bcrp.gob.pe), FIX (mx.dolarapi.com) |
| Mercado (v2)   | currency-api, una vez por hora: CRC, DOP, PYG y UYU                                                                                                    |

El histórico del BCV desde 2023 sale de ve.dolarapi.com y se carga en tandas de
12 meses por ejecución, para no superar el límite de CPU del plan gratuito. El
de Argentina desde 2023 sale de ArgentinaDatos, una casa por ejecución; el de
las tasas oficiales desde 2023, de cada fuente (Chile, un año por ejecución), y
el de las de mercado desde 2024-03-02, de currency-api, cinco días por
ejecución.

Las monedas de `v2/` que no salen de `v1/` guardan su estado actual en
`v2/meta/latest.json` (se reescribe solo cuando cambia) y su histórico en un
documento por mes para todas ellas, `v2/meta/history/AAAA-MM.json`, que se
escribe una vez por hora y en la última ejecución del día de cada moneda.
Ninguno de los dos se publica tal cual: las rutas de `v2/` los recortan por
moneda.

El P2P de las monedas de `v2/` se lee cada 15 minutos y no cada 5: el estado de
todas ellas es un solo documento, y reescribirlo en cada ejecución gastaría la
mayor parte de la cuota diaria de escrituras. El bolívar sigue cada 5 minutos
en `v1/`. Si OKX responde HTTP 429 (lo hace a veces con las direcciones de
Cloudflare, que comparten muchos Workers), se deja de consultar 15 minutos; y
cada ejecución lee como mucho 4 respaldos, para no pasar de las 50 peticiones
externas por ejecución del plan gratuito.

dolarapi.com pide citar el servicio en toda publicación que use sus datos
(«DolarApi https://dolarapi.com») y sugiere no consultarlo más de una vez
cada pocas horas por serie; las casas de Argentina se leen juntas una vez por
hora.

## Desarrollo

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run dev   # luego: curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
              #   y:     curl http://localhost:8787/v1/latest.json
```

## Despliegue

```bash
npx wrangler login
npm run deploy
```

El primer despliegue crea el namespace de KV y conecta `rates.apparus.app` al
Worker (el dominio debe estar en la misma cuenta de Cloudflare). Tras la primera
ejecución programada:

```bash
curl https://rates.apparus.app/v1/latest.json
```

## Límites del plan gratuito

| Recurso                 | Límite diario | Uso previsto                                                                                                                                                                          |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peticiones al Worker    | 100.000       | Las de quien consuma el feed, más 288 ejecuciones programadas                                                                                                                         |
| Lecturas de KV          | 100.000       | Pocas: la caché de Cloudflare responde las peticiones repetidas, por ruta                                                                                                             |
| Escrituras en KV        | 1.000         | Unas 430: `v1/latest.json` en cada ejecución, el estado de `v2/` cada 15 minutos y los meses una vez por hora. La carga inicial del histórico suma unas 300 más, repartidas en un día |
| Eventos de Workers Logs | 200.000       | Unos pocos miles: una ejecución y sus avisos cada 5 minutos, más las peticiones                                                                                                       |

Al superar un límite, el servicio deja de responder hasta el día siguiente; no
genera cargos.

## Protección del feed

La URL es pública, así que conviene limitar el abuso:

1. Regla de limitación de peticiones por IP para `rates.apparus.app` (el plan
   gratuito incluye una), para que nadie agote el límite diario de peticiones.
2. Si alguna vez se borra el Worker, comprobar que no quede ningún registro
   DNS de `rates.apparus.app` apuntando a él.

## Vigilancia

Un monitor externo gratuito (por ejemplo, UptimeRobot) que revise
`v1/latest.json` y avise si `updatedAt` tiene más de 30 minutos. Los avisos de
fuentes caídas quedan guardados unos días en Workers Logs (pestaña
Observability del Worker), dentro de los 200.000 eventos diarios del plan
gratuito.

## Licencia

El código está bajo la licencia MIT (`LICENSE`). La licencia cubre solo el
código: los datos publicados vienen de fuentes de terceros, cada una con sus
propias condiciones de uso.
