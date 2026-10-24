const request = require("supertest");
const webshare = require("../src/webshare");
const { findShowInfo } = require("../src/meta");
const { clearTokenCache } = require("../src/auth");
const { AddonError } = require("../src/errors");
const app = require("../src/addon");

jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({ findShowInfo: jest.fn() }));
const config = encodeURIComponent(
  JSON.stringify({ login: "user", saltedPassword: "digest" }),
);
beforeEach(() => {
  jest.resetAllMocks();
  clearTokenCache();
  webshare.login.mockResolvedValue("token");
  findShowInfo.mockResolvedValue({ name: "Example", type: "movie" });
});

test("SDK catalog cache headers use one hour in seconds", async () => {
  webshare.directSearch.mockResolvedValue([]);
  const res = await request(app)
    .get(`/${config}/catalog/movie/direct/search=example.json`)
    .expect(200);
  expect(res.body.cacheMaxAge).toBe(3600);
  expect(res.headers["cache-control"]).toBe("max-age=3600, public");
});

test("token-bearing stream responses remain private and uncacheable", async () => {
  webshare.search.mockResolvedValue([
    { url: "https://example.com/file?token=hidden" },
  ]);
  const res = await request(app)
    .get(`/${config}/stream/movie/tt123.json`)
    .expect(200);
  expect(res.headers["cache-control"]).toBe("private, no-store");
});

test("catalog requests refresh an expired token once", async () => {
  webshare.login.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  webshare.directSearch
    .mockRejectedValueOnce(new AddonError("auth_expired"))
    .mockResolvedValueOnce([]);
  const res = await request(app)
    .get(`/${config}/catalog/movie/direct/search=example.json`)
    .expect(200);
  expect(res.body.metas).toEqual([]);
  expect(webshare.directSearch.mock.calls).toEqual([
    ["example", "old"],
    ["example", "new"],
  ]);
});

test("file metadata stays fresh while authentication is reused", async () => {
  webshare.getById.mockResolvedValue({ name: "File", description: "Fresh" });
  const path = `/${config}/meta/movie/coffei.webshare%3A123.json`;
  await request(app).get(path).expect(200);
  await request(app).get(path).expect(200);
  expect(webshare.getById).toHaveBeenCalledTimes(2);
  expect(webshare.login).toHaveBeenCalledTimes(1);
});

test("direct playback refreshes expired authentication for both file info and its playback URL", async () => {
  webshare.login
    .mockResolvedValueOnce("old-token")
    .mockResolvedValueOnce("new-token");
  webshare.getById
    .mockRejectedValueOnce(new AddonError("auth_expired"))
    .mockResolvedValueOnce({
      name: "Example.1080p.CZ.mkv",
      filename: "Example.1080p.CZ.mkv",
      size: 2000000000,
      language: "CZ",
      parsedTitle: { resolution: "1080p" },
    });
  const response = await request(app)
    .get(`/${config}/stream/movie/coffei.webshare%3A123.json`)
    .expect(200);
  expect(webshare.getById.mock.calls).toEqual([
    ["123", "old-token"],
    ["123", "new-token"],
  ]);
  expect(webshare.login).toHaveBeenCalledTimes(2);
  expect(response.body.streams).toHaveLength(1);
  const stream = response.body.streams[0];
  expect(new URL(stream.url).searchParams.get("token")).toBe("new-token");
  expect(stream.behaviorHints.filename).toBe("Example.1080p.CZ.mkv");
  expect(response.headers["cache-control"]).toBe("private, no-store");
});
