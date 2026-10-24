const { clearTokenCache } = require("../src/auth");
beforeEach(() => clearTokenCache());
const request = require("supertest");
const webshare = require("../src/webshare");
const { findShowInfo } = require("../src/meta");
const { AddonError } = require("../src/errors");
const app = require("../src/addon");

jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({ findShowInfo: jest.fn() }));

const config = encodeURIComponent(
  JSON.stringify({ login: "user", saltedPassword: "digest" }),
);
const streamPath = `/${config}/stream/movie/tt123.json`;
let logs;
beforeEach(() => {
  jest.resetAllMocks();
  logs = jest.spyOn(console, "error").mockImplementation(() => {});
  findShowInfo.mockResolvedValue({ name: "Example", type: "movie" });
  webshare.login.mockResolvedValue("token");
});
afterEach(() => logs.mockRestore());

test.each([
  ["invalid_credentials", "Check your Webshare login"],
  ["account_restricted", "Check your Webshare account"],
  ["auth_expired", "Reconnect your Webshare account"],
  ["timeout", "took too long"],
  ["service_unavailable", "temporarily unavailable"],
])(
  "offers an external recovery action for %s without a playable URL",
  async (code, text) => {
    webshare.search.mockRejectedValue(new AddonError(code));
    const res = await request(app).get(streamPath).expect(200);
    expect(res.body.streams).toHaveLength(1);
    expect(res.body.streams[0].name).toContain(text);
    expect(res.body.streams[0].externalUrl).toContain(
      `configure?reason=${code}`,
    );
    expect(res.body.streams[0].url).toBeUndefined();
    expect(res.body.cacheMaxAge).toBe(0);
  },
);

test("catalog failure cards provide help metadata and streams without logging in again", async () => {
  webshare.directSearch.mockRejectedValue(new AddonError("auth_expired"));
  const catalog = await request(app)
    .get(`/${config}/catalog/movie/direct/search=example.json`)
    .expect(200);
  const helpId = catalog.body.metas[0].id;
  expect(helpId).toBe("coffei.webshare:help:auth_expired");
  expect(catalog.body.cacheMaxAge).toBe(0);
  webshare.login.mockClear();
  const meta = await request(app)
    .get(`/${config}/meta/movie/${encodeURIComponent(helpId)}.json`)
    .expect(200);
  expect(meta.body.meta.website).toContain("reason=auth_expired");
  const streams = await request(app)
    .get(`/${config}/stream/movie/${encodeURIComponent(helpId)}.json`)
    .expect(200);
  expect(streams.body.streams[0].externalUrl).toContain("reason=auth_expired");
  expect(webshare.login).not.toHaveBeenCalled();
  expect(webshare.getById).not.toHaveBeenCalled();
});

test("a genuine empty search stays empty", async () => {
  webshare.search.mockResolvedValue([]);
  webshare.directSearch.mockResolvedValue([]);
  expect((await request(app).get(streamPath)).body.streams).toEqual([]);
  expect(
    (
      await request(app).get(
        `/${config}/catalog/movie/direct/search=example.json`,
      )
    ).body.metas,
  ).toEqual([]);
});

test.each([
  [
    new AddonError("invalid_credentials"),
    "Login credentials are incorrect",
    401,
  ],
  [new AddonError("account_restricted"), "restricted or disabled", 403],
  [
    Object.assign(new Error("SECRET"), { code: "ETIMEDOUT" }),
    "took too long",
    504,
  ],
  [new Error("SECRET token=user-token"), "temporarily unavailable", 502],
])(
  "configuration explains the actual failure and preserves only the username",
  async (error, text) => {
    webshare.saltPassword.mockRejectedValue(error);
    const res = await request(app)
      .post("/configure")
      .type("form")
      .send({ login: "my-user", password: "do-not-echo" })
      .expect(200);
    expect(res.text).toContain(text);
    expect(res.text).toContain("my-user");
    expect(res.text).not.toContain("do-not-echo");
    expect(res.text).not.toContain("SECRET");
    expect(res.headers["cache-control"]).toBe("no-store");
  },
);

test("never puts upstream messages, credentials or arbitrary error codes into responses or logs", async () => {
  const secret = "SECRET token=hidden";
  webshare.search.mockRejectedValue(
    Object.assign(new Error(secret), { code: secret }),
  );
  const stream = await request(app).get(streamPath);
  expect(JSON.stringify(stream.body)).not.toContain(secret);
  expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  expect(JSON.stringify(logs.mock.calls)).not.toContain("digest");
});

test.each([
  ["file_missing", 404],
  ["file_locked", 403],
  ["file_private", 403],
  ["file_unavailable", 503],
  ["download_limit", 429],
  ["auth_expired", 401],
])(
  "playback explains %s and supplies a safe help action",
  async (code, status) => {
    webshare.getUrl.mockRejectedValue(new AddonError(code));
    const res = await request(app)
      .get("/getUrl/id?token=hidden")
      .expect(status);
    expect(res.body.code).toBe(code);
    expect(res.body.help).toContain(`reason=${code}`);
    expect(res.body.help).not.toContain("hidden");
    expect(res.headers["cache-control"]).toBe("no-store");
  },
);

test("only allowlisted query reasons are displayed on account setup", async () => {
  const valid = await request(app).get("/configure?reason=auth_expired");
  expect(valid.text).toContain("authentication has expired");
  const invalid = await request(app).get(
    "/configure?reason=%3Cscript%3Esecret%3C%2Fscript%3E",
  );
  expect(invalid.text).not.toContain("<script>secret</script>");
  expect(invalid.text).not.toContain('role="alert"');
});
