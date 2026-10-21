# rates-feed

Worker de Cloudflare que recolecta tasas de cambio desde fuentes públicas, con
respaldos, y las publica como JSON estático en `rates.apparus.app`.

## Qué publica

| Ruta                      | Contenido                                                                                                               | Caché                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `v1/latest.json`          | Tasas actuales: BCV dólar y euro, USDT y monedas extra por dólar, cada una con fuente, fecha efectiva y hora de captura | 2 min                                      |
| `v1/history/AAAA-MM.json` | Cierre de cada día del mes                                                                                              | 15 min el mes en curso, 1 año los cerrados |
| `v1/meta/backfill.json`   | Progreso de la carga inicial del histórico                                                                              | 2 min                                      |

Se ejecuta cada 5 minutos, porque el USDT cambia a lo largo del día. Si todas
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
```

## Despliegue

1. Activar R2 en el panel de Cloudflare (R2 Object Storage). Pide un método de
   pago, pero este volumen está dentro del plan gratuito.
2. Crear el bucket:
   ```bash
   npx wrangler login
   npx wrangler r2 bucket create rates-feed
   ```
3. Desplegar el Worker:
   ```bash
   npm run deploy
   ```
4. Publicar el bucket en el dominio: panel de Cloudflare › R2 ›
   `rates-feed` › Settings › Custom Domains › `rates.apparus.app`.
5. Comprobar, tras la primera ejecución programada:
   ```bash
   curl https://rates.apparus.app/v1/latest.json
   ```

## Protección del feed

La URL es pública, así que conviene limitar el abuso:

1. Regla de caché «Cache Everything» para `rates.apparus.app`, para que casi
   todas las peticiones se sirvan desde la CDN.
2. Regla de limitación de peticiones por IP (el plan gratuito incluye una).
3. Alerta de facturación en Cloudflare.
4. Si alguna vez se borra el bucket, borrar también el registro
   `rates.apparus.app`.

## Vigilancia

Un monitor externo gratuito (por ejemplo, UptimeRobot) que revise
`v1/latest.json` y avise si `updatedAt` tiene más de 30 minutos. Los avisos de
fuentes caídas quedan en los logs del Worker (`npx wrangler tail`).
