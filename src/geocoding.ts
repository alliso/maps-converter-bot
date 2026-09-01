import { geocode } from "./maps/geocode";
import { createSerialQueue, QueueFullError, type Enqueue } from "./rateLimit";

/** Nominatim's usage policy: at most one request per second, process-wide. */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;
/**
 * Roughly ten seconds of backlog. Past that the answer arrives after the user
 * has given up, and a search result now beats a pin later.
 */
export const MAX_PENDING_LOOKUPS = 10;

/**
 * Wraps `geocode` in the process-wide queue. Keeps `geocode`'s contract: a
 * lookup that cannot happen returns undefined, and the caller falls back to
 * opening the place as a search.
 */
export function createQueuedGeocode(
  enqueue: Enqueue = createSerialQueue(NOMINATIM_MIN_INTERVAL_MS, {
    maxPending: MAX_PENDING_LOOKUPS,
  }),
  geocodeImpl: typeof geocode = geocode,
): typeof geocode {
  return async (query, options) => {
    try {
      return await enqueue(() => geocodeImpl(query, options));
    } catch (error) {
      if (error instanceof QueueFullError) return undefined;
      throw error;
    }
  };
}

export const queuedGeocode = createQueuedGeocode();
