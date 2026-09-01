import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Location, UserFromGetMe, Venue } from "grammy/types";

import { queuedGeocode } from "../geocoding";
import { resolveSharedContent, type ResolveOptions } from "../maps/resolve";
import type { ParseResult, Place } from "../maps/types";
import { helpText, render, summarise, type Reply } from "./render";

export type Resolver = (
  text: string | null | undefined,
  options?: ResolveOptions,
) => Promise<ParseResult>;

export type BotDeps = {
  /** Injectable for tests, so no update ever reaches the network. */
  resolve?: Resolver;
  /** Skips the `getMe` round trip; tests always pass one. */
  botInfo?: UserFromGetMe;
};

/**
 * Inline results have to come back before Telegram gives up on the query, which
 * leaves no room for the full 8s + 6s a chat message can afford.
 */
const INLINE_TIMEOUT_MS = 4000;
/** Telegram caches inline answers; a minute is long enough to help and short
 * enough that a fixed geocoder result is not stuck for the day. */
const INLINE_CACHE_SECONDS = 60;

export function createBot(token: string, deps: BotDeps = {}): Bot {
  const resolve = deps.resolve ?? defaultResolver;
  const bot = new Bot(token, deps.botInfo ? { botInfo: deps.botInfo } : undefined);

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(helpText(ctx.me.username), { parse_mode: "HTML" });
  });

  // A venue message carries `location` too, so it has to be matched first or
  // the plain-location handler swallows it and drops the name.
  bot.on("message:venue", (ctx) => answer(ctx, render(placeOf(fromVenue(ctx.message.venue)))));

  bot.on("message:location", (ctx) =>
    answer(ctx, render(placeOf(fromLocation(ctx.message.location)))),
  );

  bot.on("message:text", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(ignore);
    const result = await resolve(ctx.message.text, { language: ctx.from?.language_code });
    await answer(ctx, render(result));
  });

  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (!query) return ctx.answerInlineQuery([], { cache_time: INLINE_CACHE_SECONDS });

    const result = await resolve(query, {
      language: ctx.from?.language_code,
      timeoutMs: INLINE_TIMEOUT_MS,
    });
    const reply = render(result);

    return ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: "place",
          title: summarise(result),
          description: result.ok ? "Abrir en Apple Maps, Google Maps o Waze" : undefined,
          input_message_content: {
            message_text: reply.text,
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
          reply_markup: keyboardFor(reply),
        },
      ],
      { cache_time: INLINE_CACHE_SECONDS },
    );
  });

  return bot;
}

/** The real resolver: expands short links and geocodes through the shared queue. */
export const defaultResolver: Resolver = (text, options = {}) =>
  resolveSharedContent(text, { geocodeImpl: queuedGeocode, ...options });

async function answer(ctx: Context, reply: Reply): Promise<void> {
  await ctx.reply(reply.text, {
    parse_mode: "HTML",
    // The preview would be of the link we were given, not of where we are
    // sending the user, so it is only noise under the buttons.
    link_preview_options: { is_disabled: true },
    reply_markup: keyboardFor(reply),
  });
}

function keyboardFor(reply: Reply): InlineKeyboard | undefined {
  if (reply.buttons.length === 0) return undefined;

  const keyboard = new InlineKeyboard();
  for (const button of reply.buttons) keyboard.url(button.text, button.url);
  return keyboard;
}

/** Telegram's own pin: coordinates and nothing else. */
export function fromLocation(location: Location): Place {
  return { coordinates: { latitude: location.latitude, longitude: location.longitude } };
}

/** A venue is a pin with a name and an address already attached. */
export function fromVenue(venue: Venue): Place {
  return {
    ...fromLocation(venue.location),
    label: venue.title,
    address: venue.address,
  };
}

const placeOf = (place: Place): ParseResult => ({ ok: true, place });

const ignore = () => undefined;
