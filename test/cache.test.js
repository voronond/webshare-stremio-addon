const { createTTLCache } = require("../src/cache");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("reuses values until TTL expires, then refreshes", async () => {
  let now = 0;
  const cache = createTTLCache({ ttl: 100, maxEntries: 2, now: () => now });
  const load = jest
    .fn()
    .mockResolvedValueOnce("first")
    .mockResolvedValueOnce("next");
  expect(await cache.get("a", load)).toBe("first");
  now = 99;
  expect(await cache.get("a", load)).toBe("first");
  now = 100;
  expect(await cache.get("a", load)).toBe("next");
  expect(load).toHaveBeenCalledTimes(2);
});

test("coalesces concurrent requests without caching rejections", async () => {
  const cache = createTTLCache({ ttl: 100, maxEntries: 2 });
  const first = deferred();
  const load = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce("retry");
  const a = cache.get("a", load);
  const b = cache.get("a", load);
  const failed = Promise.allSettled([a, b]);
  first.reject(new Error("offline"));
  expect((await failed).map((result) => result.status)).toEqual([
    "rejected",
    "rejected",
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(cache.size()).toBe(0);
  expect(await cache.get("a", load)).toBe("retry");
});

test("evicts the least recently used entry at capacity", async () => {
  const cache = createTTLCache({ ttl: 1000, maxEntries: 2 });
  await cache.get("a", () => "A");
  await cache.get("b", () => "B");
  await cache.get("a", () => "unused");
  await cache.get("c", () => "C");
  expect(cache.size()).toBe(2);
  expect(await cache.get("b", () => "refreshed B")).toBe("refreshed B");
});

test.each(["invalidate", "clear", "evict"])(
  "%s prevents stale in-flight work from repopulating the cache",
  async (operation) => {
    const cache = createTTLCache({ ttl: 1000, maxEntries: 1 });
    const stale = deferred();
    const pending = cache.get("a", () => stale.promise);
    if (operation === "invalidate") cache.invalidate("a");
    else if (operation === "clear") cache.clear();
    else await cache.get("b", () => "B");
    expect(await cache.get("a", () => "new A")).toBe("new A");
    stale.resolve("old A");
    await pending;
    expect(await cache.get("a", () => "unused")).toBe("new A");
  },
);

test("late failure cannot discard a newer value or a refresh in flight", async () => {
  const cache = createTTLCache({ ttl: 1000, maxEntries: 1 });
  await cache.get("a", () => "old");
  expect(cache.invalidate("a", "old")).toBe(true);
  const refresh = deferred();
  const pending = cache.get("a", () => refresh.promise);
  expect(cache.invalidate("a", "old")).toBe(false);
  refresh.resolve("new");
  await pending;
  expect(cache.invalidate("a", "old")).toBe(false);
  expect(await cache.get("a", () => "unused")).toBe("new");
});
