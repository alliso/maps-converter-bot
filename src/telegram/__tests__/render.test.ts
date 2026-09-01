import type { Place } from "../../maps/types";
import { helpText, render, renderFailure, renderPlace, summarise } from "../render";

const SOL: Place = {
  coordinates: { latitude: 40.416944, longitude: -3.703333 },
  label: "Puerta del Sol",
};

describe("renderPlace", () => {
  it("shows the name and the coordinates", () => {
    const reply = renderPlace(SOL);

    expect(reply.text).toContain("<b>Puerta del Sol</b>");
    expect(reply.text).toContain("<code>40.416944,-3.703333</code>");
  });

  it("shows the geocoded address so a wrong match is visible", () => {
    const reply = renderPlace({ ...SOL, address: "Puerta del Sol, Centro, Madrid" });

    expect(reply.text).toContain("Puerta del Sol, Centro, Madrid");
  });

  it("says out loud when there are no coordinates", () => {
    const reply = renderPlace({ query: "Prta del Sol" });

    expect(reply.text).toContain("<b>Prta del Sol</b>");
    expect(reply.text).toContain("se abrirá como búsqueda");
  });

  it("falls back to a generic name for a bare pin", () => {
    expect(renderPlace({ coordinates: SOL.coordinates! }).text).toContain("<b>Ubicación</b>");
  });

  it("escapes HTML in names that come from a link", () => {
    const reply = renderPlace({ query: "Bar <b>Pepe</b> & Co" });

    expect(reply.text).toContain("Bar &lt;b&gt;Pepe&lt;/b&gt; &amp; Co");
  });

  it("builds one web button per app", () => {
    const reply = renderPlace(SOL);

    expect(reply.buttons.map((button) => button.text)).toEqual([
      "🍎 Apple Maps",
      "🗺️ Google Maps",
      "🚗 Waze",
    ]);
    // Telegram rejects a URL button that is not http(s) or tg://.
    for (const button of reply.buttons) expect(button.url).toMatch(/^https:\/\//);
  });

  it("points every button at the same place", () => {
    for (const button of renderPlace(SOL).buttons) {
      expect(decodeURIComponent(button.url)).toContain("40.416944,-3.703333");
    }
  });

  it("sends a query when that is all there is", () => {
    for (const button of renderPlace({ query: "Puerta del Sol" }).buttons) {
      expect(decodeURIComponent(button.url)).toContain("Puerta del Sol");
    }
  });
});

describe("renderFailure", () => {
  it("explains an empty share without offering buttons", () => {
    const reply = renderFailure({ ok: false, reason: "empty" });

    expect(reply.text).toContain("No me has mandado nada");
    expect(reply.buttons).toEqual([]);
  });

  it("shows the link it did not understand", () => {
    const reply = renderFailure({
      ok: false,
      reason: "unsupported",
      url: "https://example.com/?a=1&b=2",
    });

    expect(reply.text).toContain("No he reconocido");
    expect(reply.text).toContain("<code>https://example.com/?a=1&amp;b=2</code>");
  });

  it("copes with an unsupported share that has no URL", () => {
    expect(renderFailure({ ok: false, reason: "unsupported" }).text).not.toContain("<code>");
  });
});

describe("render", () => {
  it("dispatches on the result", () => {
    expect(render({ ok: true, place: SOL }).buttons).toHaveLength(3);
    expect(render({ ok: false, reason: "empty" }).buttons).toHaveLength(0);
  });
});

describe("summarise", () => {
  it("prefers the label, then the query, then the coordinates", () => {
    expect(summarise({ ok: true, place: SOL })).toBe("Puerta del Sol");
    expect(summarise({ ok: true, place: { query: "Sol" } })).toBe("Sol");
    expect(summarise({ ok: true, place: { coordinates: SOL.coordinates! } })).toBe(
      "40.416944,-3.703333",
    );
  });

  it("has something to say for an empty place and for a failure", () => {
    expect(summarise({ ok: true, place: {} })).toBe("Ubicación");
    expect(summarise({ ok: false, reason: "unsupported" })).toContain("No he reconocido");
  });
});

describe("helpText", () => {
  it("mentions inline mode only when it knows the username", () => {
    expect(helpText("mapsconverterbot")).toContain("@mapsconverterbot");
    expect(helpText()).not.toContain("@");
  });

  it("escapes the username", () => {
    expect(helpText("a<b>")).toContain("@a&lt;b&gt;");
  });
});
