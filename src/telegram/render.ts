import { buildTargetUrls, MAP_APPS } from "../maps/apps";
import { formatCoordinates } from "../maps/coordinates";
import type { ParseResult, Place } from "../maps/types";

/**
 * A button that opens the place in one maps app.
 *
 * Telegram only accepts `http(s)://` and `tg://` in a URL button, so the app
 * deep links the iOS version uses (`maps://`, `comgooglemaps://`, `waze://`)
 * are unusable here and every button carries the web URL. On a phone the
 * universal links for Apple Maps and Waze still hand off to the installed app;
 * Google Maps opens the web map, which offers the app from there.
 */
export type LinkButton = { text: string; url: string };

/** Message body (Telegram HTML) plus the buttons that go under it. */
export type Reply = { text: string; buttons: LinkButton[] };

export function helpText(botUsername?: string): string {
  const lines = [
    "Mándame una ubicación y te la devuelvo abierta en la app que quieras.",
    "",
    "Entiendo:",
    "• Enlaces de Apple Maps, Google Maps y Waze, incluidos los cortos (maps.app.goo.gl, share.google)",
    "• Enlaces <code>geo:</code> y coordenadas sueltas dentro de un mensaje",
    "• Ubicaciones y sitios compartidos desde el propio Telegram",
  ];

  if (botUsername) {
    lines.push(
      "",
      `También funciona en cualquier chat sin añadirme: escribe <code>@${escapeHtml(botUsername)}</code> y pega el enlace.`,
    );
  }

  return lines.join("\n");
}

const NOT_RECOGNISED = "No he reconocido ninguna ubicación aquí.";
const NOTHING_SHARED = "No me has mandado nada que abrir. Prueba con un enlace de mapas o unas coordenadas.";

export function render(result: ParseResult): Reply {
  return result.ok ? renderPlace(result.place) : renderFailure(result);
}

export function renderPlace(place: Place): Reply {
  const lines = [`📍 <b>${escapeHtml(place.label ?? place.query ?? "Ubicación")}</b>`];

  if (place.coordinates) {
    lines.push(`<code>${formatCoordinates(place.coordinates)}</code>`);
  } else {
    // Saying it out loud beats a silent downgrade: without coordinates the
    // destination app is guessing from a name.
    lines.push("<i>Sin coordenadas exactas — se abrirá como búsqueda.</i>");
  }

  // The address the geocoder matched, so a wrong hit is visible before tapping.
  if (place.address) lines.push(escapeHtml(place.address));

  return { text: lines.join("\n"), buttons: buttonsFor(place) };
}

export function renderFailure(failure: Extract<ParseResult, { ok: false }>): Reply {
  const lines = [failure.reason === "empty" ? NOTHING_SHARED : NOT_RECOGNISED];
  // Seeing the offending link is the difference between "no funciona" and a
  // report worth acting on.
  if (failure.url) lines.push(`<code>${escapeHtml(failure.url)}</code>`);

  return { text: lines.join("\n"), buttons: [] };
}

/** Short label for the inline-mode result list, where there is no room for HTML. */
export function summarise(result: ParseResult): string {
  if (!result.ok) return NOT_RECOGNISED;

  const { place } = result;
  return (
    place.label ??
    place.query ??
    (place.coordinates ? formatCoordinates(place.coordinates) : "Ubicación")
  );
}

function buttonsFor(place: Place): LinkButton[] {
  return MAP_APPS.map((app) => ({
    text: `${app.symbol} ${app.name}`,
    url: buildTargetUrls(app.id, place).web,
  }));
}

/** Telegram's HTML mode only cares about these three. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
