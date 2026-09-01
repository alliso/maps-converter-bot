import { createQueuedGeocode, queuedGeocode } from "../geocoding";
import type { GeocodeResult } from "../maps/geocode";
import { QueueFullError, type Enqueue } from "../rateLimit";

const MATCH: GeocodeResult = {
  coordinates: { latitude: 40.4, longitude: -3.7 },
  address: "Puerta del Sol, Madrid",
};

const passthrough: Enqueue = (task) => task();

describe("createQueuedGeocode", () => {
  it("passes the query and options through the queue", async () => {
    const geocode = jest.fn().mockResolvedValue(MATCH);
    const result = await createQueuedGeocode(passthrough, geocode)("Sol", { language: "es" });

    expect(result).toBe(MATCH);
    expect(geocode).toHaveBeenCalledWith("Sol", { language: "es" });
  });

  it("gives up quietly when the queue is full", async () => {
    const geocode = jest.fn();
    const full: Enqueue = () => Promise.reject(new QueueFullError());

    await expect(createQueuedGeocode(full, geocode)("Sol")).resolves.toBeUndefined();
    expect(geocode).not.toHaveBeenCalled();
  });

  it("does not swallow other failures", async () => {
    const broken: Enqueue = () => Promise.reject(new Error("boom"));

    await expect(createQueuedGeocode(broken, jest.fn())("Sol")).rejects.toThrow("boom");
  });

  it("exports a ready-made instance", () => {
    expect(typeof queuedGeocode).toBe("function");
  });
});
