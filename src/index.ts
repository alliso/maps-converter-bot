import { createServer } from "node:http";

import { webhookCallback } from "grammy";

import { loadConfig } from "./config";
import { createBot } from "./telegram/bot";

async function main(): Promise<void> {
  const config = loadConfig();
  const bot = createBot(config.token);

  await bot.api.setMyCommands([
    { command: "start", description: "Cómo funciona" },
    { command: "help", description: "Cómo funciona" },
  ]);

  if (!config.webhookUrl) {
    // Long polling: nothing to expose, which is what you want in local.
    process.once("SIGINT", () => void bot.stop());
    process.once("SIGTERM", () => void bot.stop());
    await bot.start({ onStart: ({ username }) => console.log(`@${username} escuchando`) });
    return;
  }

  await bot.init();
  await bot.api.setWebhook(config.webhookUrl, {
    secret_token: config.webhookSecret,
    drop_pending_updates: true,
  });

  const handle = webhookCallback(bot, "http", { secretToken: config.webhookSecret });
  const server = createServer((request, response) => {
    if (request.method === "POST") return void handle(request, response);
    // Something for a health check to look at.
    response.writeHead(200).end("ok");
  });

  process.once("SIGINT", () => server.close());
  process.once("SIGTERM", () => server.close());
  server.listen(config.port, () => console.log(`@${bot.botInfo.username} en :${config.port}`));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
