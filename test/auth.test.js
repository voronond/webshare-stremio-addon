const {
  createAuthClient,
  credentialKey,
  TOKEN_TTL_MS,
} = require("../src/auth");
const { createTTLCache } = require("../src/cache");
const { AddonError } = require("../src/errors");

const account = { login: "alice", saltedPassword: "alice-digest" };
let client;
beforeEach(() => {
  client = {
    login: jest.fn().mockResolvedValue("token"),
    saltPassword: jest.fn().mockResolvedValue("salted"),
  };
});

test("token reuse is isolated by account and credential changes", async () => {
  const auth = createAuthClient(client);
  await Promise.all([auth.getToken(account), auth.getToken(account)]);
  expect(client.login).toHaveBeenCalledTimes(1);
  await auth.getToken({ login: "bob", saltedPassword: "alice-digest" });
  await auth.getToken({ login: "alice", saltedPassword: "changed-digest" });
  await auth.getToken({ login: "alice", password: "changed-digest" });
  expect(client.login).toHaveBeenCalledTimes(4);
  expect(client.saltPassword).toHaveBeenCalledTimes(1);
  expect(credentialKey(account)).toMatch(/^[a-f0-9]{64}$/);
  expect(credentialKey(account)).not.toContain("alice");
  expect(credentialKey(account)).not.toBe(
    credentialKey({ ...account, saltedPassword: "changed-digest" }),
  );
});

test("a token expires after its bounded lifetime", async () => {
  let now = 0;
  const auth = createAuthClient(
    client,
    createTTLCache({ ttl: TOKEN_TTL_MS, maxEntries: 2, now: () => now }),
  );
  await auth.getToken(account);
  now = TOKEN_TTL_MS;
  await auth.getToken(account);
  expect(client.login).toHaveBeenCalledTimes(2);
});

test("rejected and malformed logins are not cached", async () => {
  const auth = createAuthClient(client);
  client.login
    .mockRejectedValueOnce(new AddonError("invalid_credentials"))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce("valid");
  await expect(auth.getToken(account)).rejects.toMatchObject({
    code: "invalid_credentials",
  });
  await expect(auth.getToken(account)).rejects.toMatchObject({
    code: "service_unavailable",
  });
  await expect(auth.getToken(account)).resolves.toBe("valid");
  expect(client.login).toHaveBeenCalledTimes(3);
});

test("refreshes expired authentication once and retries with the new token", async () => {
  client.login.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  const auth = createAuthClient(client);
  const action = jest
    .fn()
    .mockRejectedValueOnce(new AddonError("auth_expired"))
    .mockResolvedValueOnce("results");
  await expect(auth.withToken(account, action)).resolves.toBe("results");
  expect(action.mock.calls).toEqual([["old"], ["new"]]);
  expect(client.login).toHaveBeenCalledTimes(2);
});

test("does not loop when refreshed authentication also fails", async () => {
  client.login
    .mockResolvedValueOnce("old")
    .mockResolvedValueOnce("new")
    .mockResolvedValueOnce("later");
  const auth = createAuthClient(client);
  const action = jest.fn().mockRejectedValue(new AddonError("auth_expired"));
  await expect(auth.withToken(account, action)).rejects.toMatchObject({
    code: "auth_expired",
  });
  expect(action).toHaveBeenCalledTimes(2);
  expect(client.login).toHaveBeenCalledTimes(2);
  expect(await auth.getToken(account)).toBe("later");
});

test("a service outage neither invalidates a token nor retries an operation", async () => {
  const auth = createAuthClient(client);
  const action = jest
    .fn()
    .mockRejectedValue(new AddonError("service_unavailable"));
  await expect(auth.withToken(account, action)).rejects.toMatchObject({
    code: "service_unavailable",
  });
  expect(await auth.getToken(account)).toBe("token");
  expect(action).toHaveBeenCalledTimes(1);
  expect(client.login).toHaveBeenCalledTimes(1);
});

test("concurrent expired responses share a refresh and do not evict a newer token", async () => {
  client.login.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  const auth = createAuthClient(client);
  let rejectStale;
  const staleFailure = new Promise((resolve, reject) => {
    rejectStale = reject;
  });
  const first = auth.withToken(account, (token) =>
    token === "old" ? staleFailure : "first-result",
  );
  const second = auth.withToken(account, (token) =>
    token === "old"
      ? Promise.reject(new AddonError("auth_expired"))
      : "second-result",
  );
  expect(await second).toBe("second-result");
  rejectStale(new AddonError("auth_expired"));
  expect(await first).toBe("first-result");
  expect(await auth.getToken(account)).toBe("new");
  expect(client.login).toHaveBeenCalledTimes(2);
});
