# rates-feed

Worker de Cloudflare que recolecta tasas de cambio desde fuentes públicas, con
respaldos, y las publica como JSON estático en `rates.apparus.app`. Guarda los
documentos en Workers KV y los sirve él mismo, con la caché de Cloudflare
delante; todo dentro del plan gratuito y sin método de pago.

## Qué publica

| Ruta                      | Contenido                                                                                                               | Caché                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `v1/latest.json`          | Tasas actuales: BCV dólar y euro, USDT y monedas extra por dólar, cada una con fuente, fecha efectiva y hora de captura | 2 min                                      |
| `v1/history/AAAA-MM.json` | Cierre de cada día del mes                                                                                              | 15 min el mes en curso, 1 año los cerrados |

Se ejecuta cada 5 minutos, porque el USDT cambia a lo largo del día. El
progreso de la carga inicial del histórico se guarda en `v1/meta/backfill.json`,
que no se publica. Si todas
las fuentes de un dato fallan, ese dato conserva su último valor y su
`fetchedAt` antiguo, para que quien lo consuma sepa que está desactualizado.

## Fuentes

| Dato          | Orden                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BCV dólar     | ve.dolarapi.com, open.er-api.com                                                                                                                          |
| BCV euro      | ve.dolarapi.com, cruce aproximado de open.er-api.com (no entra al histórico)                                                                              |
| USDT          | criptoya.com (Binance P2P), Binance P2P directo (mediana de los primeros anuncios de comerciantes verificados), api.yadio.io, paralelo de ve.dolarapi.com |
| Monedas extra | currency-api (jsDelivr), open.er-api.com, api.yadio.io                                                                                                    |

El histórico del BCV desde 2023 sale de ve.dolarapi.com y se carga en tandas de
12 meses por ejecución, para no superar el límite de CPU del plan gratuito.

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

| Recurso              | Límite diario | Uso previsto                                                          |
| -------------------- | ------------- | --------------------------------------------------------------------- |
| Peticiones al Worker | 100.000       | Las de quien consuma el feed, más 288 ejecuciones programadas         |
| Lecturas de KV       | 100.000       | Pocas: la caché de Cloudflare responde las peticiones repetidas       |
| Escrituras en KV     | 1.000         | Unas 600: `latest.json` en cada ejecución y el mes solo cuando cambia |

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
fuentes caídas quedan en los logs del Worker (`npx wrangler tail`).
