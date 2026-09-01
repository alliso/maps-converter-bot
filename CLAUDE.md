# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # tsx watch src/index.ts (long polling, needs BOT_TOKEN)
npm run build          # tsc -> dist/
npm start              # node dist/index.js
npm run typecheck      # tsc --noEmit
npm test               # jest
npm run test:coverage  # thresholds: 95% statements/functions/lines, 90% branches
npm run test:mutation  # stryker, breaks under 80% mutation score
```

Single test file: `npx jest src/maps/__tests__/parse.test.ts`.
Single case: `npm test -- -t "prefers the pin in data="`.

There is no linter/formatter configured; `typecheck` is the only static gate.

## Architecture

```
message → resolveSharedContent(text)   src/maps/resolve.ts  (network: expand + geocode)
        → render(ParseResult)          src/telegram/render.ts (text + buttons, no grammY)
        → buildTargetUrls(app, place)  src/maps/apps.ts
```

**`src/maps/` is a verbatim copy of the parser from the iOS app**
([Maps-converter](https://github.com/alliso/Maps-converter)), tests included. It depends on
nothing but `fetch` — no Node built-ins, no React Native, no DOM. Keep it that way so a fix
can be carried between the two repos in either direction; anything server-specific belongs
outside that directory (`src/rateLimit.ts`, `src/geocoding.ts`, `src/telegram/`).

Layering inside `src/maps/`:

- `url.ts` — hand-rolled URL splitting. Deliberately not `new URL()`: maps links contain
  things a spec parser normalises away (`geo:` without authority, `!3d`/`!4d` inside a path
  segment, values that must stay percent-encoded).
- `parse.ts` — pure, offline. Text/URL → `ParseResult`. Sets `needsResolution: true` for
  short links that carry no coordinates of their own.
- `resolve.ts` — the only layer that touches the network: expands short links (HEAD as a
  phone UA for `maps.app.goo.gl`, GET as a desktop UA for `share.google` — the two return
  the destination to opposite user agents), then geocodes a name-only place.
- `apps.ts` — `buildTargetUrls` returns `{ app, web }`. **Telegram only accepts `http(s)://`
  and `tg://` in URL buttons**, so `render.ts` uses `.web` exclusively; the `.app` deep links
  exist only to keep parity with the iOS app.

### Failure contract

A lookup that cannot happen returns `undefined`, never throws, and the place opens as a text
search instead of a pin. `geocode`, `expandShortLink` and the queue-full path in
`geocoding.ts` all follow this — preserve it when touching them.

### Rate limiting

Nominatim allows one request per second per process. `createSerialQueue` (`src/rateLimit.ts`)
serialises every geocode; `createQueuedGeocode` wraps it and converts `QueueFullError`
(backlog > 10) into `undefined`, i.e. the search fallback. `queuedGeocode` is the shared
process-wide instance and is injected as `geocodeImpl` by `defaultResolver` in
`src/telegram/bot.ts` — call sites in `src/maps/` must never reach Nominatim directly.

### Telegram layer

`render.ts` knows nothing about grammY (`ParseResult` → `{ text, buttons }`), `bot.ts` only
wires handlers. Handler order matters: `message:venue` must stay registered before
`message:location`, since a venue update carries a `location` too and would lose its name.

### Runtime modes

`loadConfig` (`src/config.ts`) throws only on a missing `BOT_TOKEN`. No `WEBHOOK_URL` → long
polling; with it, `src/index.ts` starts an HTTP server, registers the webhook, and answers
any GET with `ok` for health checks. `WEBHOOK_SECRET` is verified against
`X-Telegram-Bot-Api-Secret-Token`.

## Conventions

- User-facing strings (bot replies, help text, config errors) are in Spanish; code, comments
  and commit messages are in English.
- Collaborators are injected through an options object (`fetchImpl`, `geocodeImpl`, `now`,
  `sleep`, `resolve`, `botInfo`) so tests never hit the network — follow this instead of
  module mocking when adding new I/O.
- The Nominatim `User-Agent` in `src/maps/geocode.ts` identifies this bot; a fork must
  change it (their usage policy requires it).
