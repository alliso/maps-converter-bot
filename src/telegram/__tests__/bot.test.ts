import type { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";

import type { ParseResult } from "../../maps/types";
import { createBot, defaultResolver, fromLocation, fromVenue, type Resolver } from "../bot";

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: "Maps Converter",
  username: "mapsconverterbot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: true,
} as UserFromGetMe;

const SOL = { latitude: 40.416944, longitude: -3.703333 };

type ApiCall = { method: string; payload: Record<string, any> };

/** Builds a bot whose API calls are recorded instead of sent. */
function testBot(resolve: Resolver = async () => ({ ok: false, reason: "empty" })) {
  const calls: ApiCall[] = [];
  const bot: Bot = createBot("test-token", { resolve, botInfo: BOT_INFO });

  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, any> });
    return { ok: true, result: true } as any;
  });

  return { bot, calls, sent: (method: string) => calls.filter((call) => call.method === method) };
}

const FROM = { id: 10, is_bot: false, first_name: "Ana", language_code: "es" };
const CHAT = { id: 10, type: "private" as const, first_name: "Ana" };

function message(extra: Record<string, unknown>): Update {
  return {
    update_id: 1,
    message: { message_id: 1, date: 0, chat: CHAT, from: FROM, ...extra },
  } as Update;
}

const textUpdate = (text: string) => message({ text });

const commandUpdate = (command: string) =>
  message({
    text: command,
    entities: [{ type: "bot_command", offset: 0, length: command.length }],
  });

const inlineUpdate = (query: string): Update =>
  ({
    update_id: 1,
    inline_query: { id: "q1", from: FROM, query, offset: "", chat_type: "private" },
  }) as Update;

const found = (place: ParseResult extends never ? never : any): ParseResult => ({
  ok: true,
  place,
});

describe("text messages", () => {
  it("answers with the place and the three buttons", async () => {
    const resolve = jest.fn<Promise<ParseResult>, any>().mockResolvedValue(
      found({ coordinates: SOL, label: "Puerta del Sol" }),
    );
    const { bot, sent } = testBot(resolve);

    await bot.handleUpdate(textUpdate("https://maps.app.goo.gl/abc"));

    const [reply] = sent("sendMessage");
    expect(reply.payload.text).toContain("Puerta del Sol");
    expect(reply.payload.parse_mode).toBe("HTML");
    expect(reply.payload.link_preview_options).toEqual({ is_disabled: true });
    expect(reply.payload.reply_markup.inline_keyboard[0]).toHaveLength(3);
  });

  it("shows it is working before the network round trip", async () => {
    const { bot, calls } = testBot(async () => found({ query: "Sol" }));

    await bot.handleUpdate(textUpdate("Sol"));

    expect(calls.map((call) => call.method)).toEqual(["sendChatAction", "sendMessage"]);
  });

  it("answers anyway when the typing indicator fails", async () => {
    const { bot, sent } = testBot(async () => found({ query: "Sol" }));
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === "sendChatAction") throw new Error("flood wait");
      return prev(method, payload, signal);
    });

    await bot.handleUpdate(textUpdate("Sol"));

    expect(sent("sendMessage")).toHaveLength(1);
  });

  it("asks the geocoder for the user's language", async () => {
    const resolve = jest.fn<Promise<ParseResult>, any>().mockResolvedValue(found({ query: "Sol" }));
    const { bot } = testBot(resolve);

    await bot.handleUpdate(textUpdate("Sol"));

    expect(resolve).toHaveBeenCalledWith("Sol", { language: "es" });
  });

  it("sends no keyboard when nothing was recognised", async () => {
    const { bot, sent } = testBot(async () => ({
      ok: false,
      reason: "unsupported",
      url: "https://example.com",
    }));

    await bot.handleUpdate(textUpdate("https://example.com"));

    const [reply] = sent("sendMessage");
    expect(reply.payload.text).toContain("No he reconocido");
    expect(reply.payload.reply_markup).toBeUndefined();
  });
});

describe("commands", () => {
  it.each(["/start", "/help"])("%s explains what the bot does", async (command) => {
    const resolve = jest.fn<Promise<ParseResult>, any>();
    const { bot, sent } = testBot(resolve);

    await bot.handleUpdate(commandUpdate(command));

    expect(sent("sendMessage")[0].payload.text).toContain("@mapsconverterbot");
    // The command must not fall through to the link parser.
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("locations shared from Telegram", () => {
  it("turns a pin into buttons without asking the parser", async () => {
    const resolve = jest.fn<Promise<ParseResult>, any>();
    const { bot, sent } = testBot(resolve);

    await bot.handleUpdate(message({ location: SOL }));

    expect(sent("sendMessage")[0].payload.text).toContain("40.416944,-3.703333");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("keeps the name and address of a venue", async () => {
    const { bot, sent } = testBot();

    await bot.handleUpdate(
      message({
        location: SOL,
        venue: { location: SOL, title: "Puerta del Sol", address: "Plaza de la Puerta del Sol" },
      }),
    );

    const [reply] = sent("sendMessage");
    expect(reply.payload.text).toContain("Puerta del Sol");
    expect(reply.payload.text).toContain("Plaza de la Puerta del Sol");
  });
});

describe("inline mode", () => {
  it("answers with a single article carrying the buttons", async () => {
    const { bot, sent } = testBot(async () => found({ coordinates: SOL, label: "Sol" }));

    await bot.handleUpdate(inlineUpdate("  https://maps.app.goo.gl/abc  "));

    const [answer] = sent("answerInlineQuery");
    expect(answer.payload.results).toHaveLength(1);
    expect(answer.payload.results[0].title).toBe("Sol");
    expect(answer.payload.results[0].reply_markup.inline_keyboard[0]).toHaveLength(3);
    expect(answer.payload.results[0].input_message_content.message_text).toContain("Sol");
  });

  it("trims the query and keeps the inline timeout short", async () => {
    const resolve = jest.fn<Promise<ParseResult>, any>().mockResolvedValue(found({ query: "Sol" }));
    const { bot } = testBot(resolve);

    await bot.handleUpdate(inlineUpdate("  Sol  "));

    expect(resolve).toHaveBeenCalledWith("Sol", { language: "es", timeoutMs: 4000 });
  });

  it("offers nothing for an empty query", async () => {
    const resolve = jest.fn<Promise<ParseResult>, any>();
    const { bot, sent } = testBot(resolve);

    await bot.handleUpdate(inlineUpdate("   "));

    expect(sent("answerInlineQuery")[0].payload.results).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("still answers when the link is not one we know", async () => {
    const { bot, sent } = testBot(async () => ({ ok: false, reason: "unsupported" }));

    await bot.handleUpdate(inlineUpdate("https://example.com"));

    const [result] = sent("answerInlineQuery")[0].payload.results;
    expect(result.title).toContain("No he reconocido");
    expect(result.reply_markup).toBeUndefined();
    expect(result.description).toBeUndefined();
  });
});

describe("place mapping", () => {
  it("reads a bare location", () => {
    expect(fromLocation({ latitude: 1, longitude: 2 } as any)).toEqual({
      coordinates: { latitude: 1, longitude: 2 },
    });
  });

  it("reads a venue", () => {
    expect(
      fromVenue({ location: { latitude: 1, longitude: 2 }, title: "T", address: "A" } as any),
    ).toEqual({ coordinates: { latitude: 1, longitude: 2 }, label: "T", address: "A" });
  });
});

describe("defaultResolver", () => {
  it("parses without touching the network when the text has coordinates", async () => {
    await expect(defaultResolver("Quedamos en 40.416944,-3.703333")).resolves.toMatchObject({
      ok: true,
      place: { coordinates: { latitude: 40.416944, longitude: -3.703333 } },
    });
  });

  it("is what a bot built without deps uses", () => {
    expect(() => createBot("test-token")).not.toThrow();
  });
});
