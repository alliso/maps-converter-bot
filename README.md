# Maps Converter Bot

Bot de Telegram que recibe una ubicación y te la devuelve lista para abrir en
**Apple Maps**, **Google Maps** o **Waze**. Es el hermano de servidor de
[Maps Converter](https://github.com/alliso/Maps-converter), la app de iOS que
hace lo mismo desde la hoja de compartir.

## Cómo funciona

```
mensaje → resolveSharedContent(texto)   ← expande enlaces cortos y geocodifica
       → buildTargetUrls(app, place)    ← una URL web por cada app
       → respuesta con inline keyboard
```

Todo el parseo vive en `src/maps/`, copiado tal cual de la app de iOS: no
depende de React Native ni del navegador, sólo de `fetch`. Lo específico de
Telegram está en `src/telegram/`, y es fino a propósito — `render.ts` convierte
un `ParseResult` en texto y botones sin saber nada de grammY, y `bot.ts` sólo
enchufa handlers.

### Qué acepta

- Enlaces de Apple Maps, Google Maps y Waze, incluidos los cortos
  (`maps.app.goo.gl`, `goo.gl/maps`, `share.google`), que se expanden por red.
- `geo:` y coordenadas sueltas dentro de un mensaje.
- Ubicaciones y sitios (*venues*) compartidos desde el propio Telegram.
- Modo inline: `@tubot <enlace>` desde cualquier chat, sin añadir el bot.

La tabla completa de formatos está en el README de la app de iOS; el parser es
el mismo fichero.

## Los botones van a la web, no a la app

Telegram sólo acepta `http(s)://` y `tg://` en un botón URL, así que los deep
links que usa la versión de iOS (`maps://`, `comgooglemaps://`, `waze://`) aquí
no valen y cada botón lleva la URL web de `buildTargetUrls`. En el móvil los
universal links de Apple Maps y Waze siguen abriendo la app instalada; Google
Maps abre el mapa web, que ofrece la app desde ahí.

## Geocodificación y límite de peticiones

Igual que la app, cuando de un enlace sólo sale un nombre se consulta
[Nominatim](https://nominatim.org/) para convertirlo en un pin exacto. La
diferencia es el volumen: en el móvil una persona comparte una cosa cada vez y
el límite de una petición por segundo se cumple solo, mientras que aquí hay una
cola para todo el proceso (`src/rateLimit.ts`).

Si la cola acumula más de diez peticiones, las siguientes no esperan: devuelven
`undefined` y el sitio se abre como búsqueda, que es la misma degradación que ya
había cuando Nominatim no encuentra nada. Un resultado ahora vale más que un pin
dentro de quince segundos.

Su política de uso pide identificar la aplicación, de ahí la cabecera
`User-Agent` en `src/maps/geocode.ts` — **cámbiala si haces un fork**.

## Puesta en marcha

```bash
npm install
cp .env.example .env    # y pon el token que da @BotFather
npm run dev
```

Sin `WEBHOOK_URL` el bot usa long polling, que es lo cómodo en local: no hay
nada que exponer. Con ella puesta levanta un servidor HTTP, registra el webhook
y responde `ok` a cualquier GET para que un health check tenga algo que mirar.
`WEBHOOK_SECRET` es opcional pero recomendable si el webhook está en internet:
Telegram lo manda de vuelta en `X-Telegram-Bot-Api-Secret-Token` y el bot
rechaza lo que no lo traiga.

Para producción, `npm run build && npm start`.

Si quieres el modo inline, hay que activarlo en @BotFather (`/setinline`).

## Desarrollo

```bash
npm test              # jest
npm run test:coverage # umbrales: 95% líneas, 90% ramas
npm run test:mutation # stryker
npm run typecheck
```

Los tests de `src/maps/` vienen de la app de iOS sin tocar una línea, así que un
cambio en el parser se puede llevar de un repo al otro en los dos sentidos.
