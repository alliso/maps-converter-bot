export type Config = {
  token: string;
  /** Public HTTPS URL Telegram should post updates to. Empty means long polling. */
  webhookUrl?: string;
  port: number;
  /** Shared secret Telegram echoes back in `X-Telegram-Bot-Api-Secret-Token`. */
  webhookSecret?: string;
};

const DEFAULT_PORT = 3000;

/**
 * Reads the environment into a `Config`, failing loudly on the one thing that
 * has no sensible default.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Falta BOT_TOKEN. Copia .env.example a .env y pon el token de @BotFather.");
  }

  return {
    token,
    webhookUrl: trimmed(env.WEBHOOK_URL),
    port: parsePort(env.PORT),
    webhookSecret: trimmed(env.WEBHOOK_SECRET),
  };
}

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out ? out : undefined;
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "", 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}
