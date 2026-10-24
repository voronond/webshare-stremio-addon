const needle = require("needle");
const webshare = require("../src/webshare");
const { AddonError, classifyError } = require("../src/errors");

jest.mock("needle");

const xml = (...children) => ({ statusCode: 200, body: { children } });
const node = (name, value) => ({ name, value });
const fatal = (code) =>
  xml(
    node("status", "FATAL"),
    node("code", code),
    node("message", "SECRET token=do-not-display"),
  );

beforeEach(() => jest.resetAllMocks());

test.each([
  [
    "SALT_FATAL_1",
    "invalid_credentials",
    () => webshare.saltPassword("user", "password"),
  ],
  [
    "LOGIN_FATAL_2",
    "account_restricted",
    () => webshare.login("user", "digest"),
  ],
  [
    "LOGIN_FATAL_3",
    "account_restricted",
    () => webshare.login("user", "digest"),
  ],
  ["FILE_INFO_FATAL_1", "file_missing", () => webshare.getById("id", "token")],
  ["FILE_INFO_FATAL_2", "file_locked", () => webshare.getById("id", "token")],
  ["FILE_INFO_FATAL_3", "file_private", () => webshare.getById("id", "token")],
  ["FILE_LINK_FATAL_1", "file_missing", () => webshare.getUrl("id", "token")],
  ["FILE_LINK_FATAL_3", "file_locked", () => webshare.getUrl("id", "token")],
  [
    "FILE_LINK_FATAL_4",
    "file_unavailable",
    () => webshare.getUrl("id", "token"),
  ],
  ["FILE_LINK_FATAL_5", "download_limit", () => webshare.getUrl("id", "token")],
  ["FILE_LINK_FATAL_6", "file_private", () => webshare.getUrl("id", "token")],
  [
    "UNRECOGNIZED_FAILURE",
    "service_unavailable",
    () => webshare.login("user", "digest"),
  ],
])(
  "maps documented %s to %s without upstream message content",
  async (code, expectedCode, invoke) => {
    needle.mockResolvedValue(fatal(code));
    await expect(invoke()).rejects.toMatchObject({ code: expectedCode });
    await expect(invoke()).rejects.not.toThrow("SECRET");
  },
);

test.each([
  [() => webshare.login("user", "digest"), "invalid_credentials"],
  [() => webshare.saltPassword("user", "password"), "invalid_credentials"],
  [() => webshare.getUrl("id", "token"), "auth_expired"],
  [() => webshare.directSearch("title", "token"), "auth_expired"],
])(
  "distinguishes an HTTP authentication rejection by operation",
  async (invoke, code) => {
    needle.mockResolvedValue({ statusCode: 401 });
    await expect(invoke()).rejects.toMatchObject({ code });
  },
);

test.each([
  [() => webshare.saltPassword("user", "password"), "salt"],
  [() => webshare.login("user", "digest"), "token"],
  [() => webshare.getUrl("id", "token"), "link"],
  [() => webshare.getById("id", "token"), "name"],
])(
  "rejects a successful status with a missing required %s payload",
  async (invoke) => {
    needle.mockResolvedValue(xml(node("status", "OK")));
    await expect(invoke()).rejects.toMatchObject({
      code: "service_unavailable",
    });
  },
);

test("rejects malformed XML and search responses missing a status", async () => {
  needle
    .mockResolvedValueOnce({ statusCode: 200, body: "not XML" })
    .mockResolvedValueOnce(xml());
  await expect(webshare.login("user", "digest")).rejects.toMatchObject({
    code: "service_unavailable",
  });
  await expect(webshare.directSearch("title", "token")).rejects.toMatchObject({
    code: "service_unavailable",
  });
});

test("form encodes username characters before requesting a salt", async () => {
  needle.mockResolvedValue(xml(node("status", "OK"), node("salt", "abcd1234")));
  await webshare.saltPassword("user+name@example.com&extra=value", "password");
  expect(
    new URLSearchParams(needle.mock.calls[0][2]).get("username_or_email"),
  ).toBe("user+name@example.com&extra=value");
  expect(needle.mock.calls[0][3].headers["content-type"]).toContain(
    "application/x-www-form-urlencoded",
  );
});

test("classifies network timeouts without guessing from messages or codes", () => {
  expect(
    classifyError(Object.assign(new Error("SECRET"), { code: "ETIMEDOUT" }))
      .code,
  ).toBe("timeout");
  expect(classifyError(new Error("invalid credentials SECRET")).code).toBe(
    "service_unavailable",
  );
  expect(classifyError({ code: "SECRET" }).message).not.toContain("SECRET");
  expect(classifyError(new AddonError("download_limit")).status).toBe(429);
});
