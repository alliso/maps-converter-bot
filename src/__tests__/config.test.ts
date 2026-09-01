import { loadConfig } from "../config";

describe("loadConfig", () => {
  it("requires a token", () => {
    expect(() => loadConfig({})).toThrow(/BOT_TOKEN/);
    expect(() => loadConfig({ BOT_TOKEN: "   " })).toThrow(/BOT_TOKEN/);
  });

  it("defaults to long polling on port 3000", () => {
    expect(loadConfig({ BOT_TOKEN: "t" })).toEqual({
      token: "t",
      webhookUrl: undefined,
      port: 3000,
      webhookSecret: undefined,
    });
  });

  it("trims the values it reads", () => {
    const config = loadConfig({
      BOT_TOKEN: " t ",
      WEBHOOK_URL: " https://example.com/hook ",
      WEBHOOK_SECRET: " s ",
    });

    expect(config).toMatchObject({
      token: "t",
      webhookUrl: "https://example.com/hook",
      webhookSecret: "s",
    });
  });

  it("treats an empty webhook URL as long polling", () => {
    expect(loadConfig({ BOT_TOKEN: "t", WEBHOOK_URL: "  " }).webhookUrl).toBeUndefined();
  });

  it.each(["", "0", "-1", "65536", "http"])("falls back to 3000 for PORT=%p", (port) => {
    expect(loadConfig({ BOT_TOKEN: "t", PORT: port }).port).toBe(3000);
  });

  it("reads a valid port", () => {
    expect(loadConfig({ BOT_TOKEN: "t", PORT: "8080" }).port).toBe(8080);
  });

  it("reads process.env when given nothing", () => {
    process.env.BOT_TOKEN = "from-env";
    try {
      expect(loadConfig().token).toBe("from-env");
    } finally {
      delete process.env.BOT_TOKEN;
    }
  });
});
