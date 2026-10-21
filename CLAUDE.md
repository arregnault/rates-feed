# rates-feed — reglas del repositorio

Worker de Cloudflare que publica tasas de cambio como JSON estático. El formato
publicado (`v1/`) es un contrato con quien lo consume: un cambio incompatible va
en una ruta nueva (`v2/`) y la anterior se mantiene.

No se mencionan en este repositorio otros proyectos ni apps que consuman el
feed: ni en archivos, ni en commits, ni en PR.

## Repositorio público

- Nunca subir credenciales, tokens ni el ID de la cuenta de Cloudflare, ni en
  `wrangler.toml` ni en ningún otro archivo. `wrangler` toma la cuenta de la
  sesión al desplegar; un despliegue automático usaría secretos del
  repositorio. Lo que entra en un commit queda en el historial aunque se borre.
- Nada de datos personales.

## Idioma

- Código, identificadores y comentarios: inglés.
- Documentación, mensajes de commit y descripciones de PR: español.

## Reglas de código

- SOLID: cada fuente implementa `Source<T>`; recolección, histórico y
  almacenamiento están separados y se testean por separado.
- Sin código muerto: nada comentado ni sin usar.
- Comentarios mínimos: solo para un porqué que el código no puede decir.
- Sin emojis en ningún sitio.
- Tasas como decimales exactos (`src/decimal.ts`), nunca operaciones con
  `number` sobre valores monetarios.

## Antes de subir un cambio

`npm run lint`, `npm run typecheck` y `npm test` en verde. Cada cambio de
comportamiento lleva su test.

## Flujo de trabajo

Todo cambio va por PR contra `main`; con CI en verde se mezcla. Los cambios de
fuentes o de formato publicado se dejan abiertos para revisión del dueño.
