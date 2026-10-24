const createTTLCache = ({ ttl, maxEntries, now = () => Date.now() }) => {
  if (!(ttl > 0) || !Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Cache requires a positive TTL and capacity.");
  }
  const entries = new Map();

  const get = (key, load) => {
    const existing = entries.get(key);
    if (existing && (existing.pending || existing.expiresAt > now())) {
      // Keep frequently used entries when evicting at capacity.
      entries.delete(key);
      entries.set(key, existing);
      return existing.pending || Promise.resolve(existing.value);
    }
    entries.delete(key);
    const entry = {};
    entry.pending = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          // Invalidated or evicted work must not repopulate the cache.
          if (entries.get(key) === entry) {
            entry.value = value;
            entry.expiresAt = now() + ttl;
            entry.pending = null;
          }
          return value;
        },
        (error) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        },
      );
    entries.set(key, entry);
    while (entries.size > maxEntries)
      entries.delete(entries.keys().next().value);
    return entry.pending;
  };

  const invalidate = (key, ...expected) => {
    const entry = entries.get(key);
    // An older failed request cannot discard a newer token or refresh in flight.
    if (
      expected.length &&
      (!entry || entry.pending || entry.value !== expected[0])
    )
      return false;
    return entries.delete(key);
  };

  return {
    get,
    invalidate,
    clear: () => entries.clear(),
    size: () => entries.size,
  };
};

module.exports = { createTTLCache };
