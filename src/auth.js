const { createHash } = require("node:crypto");
const webshare = require("./webshare");
const { createTTLCache } = require("./cache");
const { AddonError, classifyError } = require("./errors");

const TOKEN_TTL_MS = 10 * 60 * 1000;
const credentialKey = (config) => {
  const salted =
    typeof config.saltedPassword === "string" && config.saltedPassword;
  const credential = salted || config.password;
  if (
    typeof config.login !== "string" ||
    !config.login.trim() ||
    typeof credential !== "string" ||
    !credential
  ) {
    throw new AddonError("invalid_credentials");
  }
  // Credentials are used only to derive an opaque in-memory cache identity.
  return createHash("sha256")
    .update(
      JSON.stringify([config.login, salted ? "salted" : "plain", credential]),
    )
    .digest("hex");
};

const createAuthClient = (
  client,
  cache = createTTLCache({ ttl: TOKEN_TTL_MS, maxEntries: 200 }),
) => {
  const getToken = (config) =>
    cache.get(credentialKey(config), async () => {
      const salted =
        typeof config.saltedPassword === "string" && config.saltedPassword;
      const password =
        salted || (await client.saltPassword(config.login, config.password));
      const token = await client.login(config.login, password);
      if (typeof token !== "string" || !token)
        throw new AddonError("service_unavailable");
      return token;
    });

  const withToken = async (config, action) => {
    const key = credentialKey(config);
    let token = await getToken(config);
    try {
      return await action(token);
    } catch (error) {
      if (classifyError(error).code !== "auth_expired") throw error;
      cache.invalidate(key, token);
    }
    token = await getToken(config);
    try {
      return await action(token);
    } catch (error) {
      if (classifyError(error).code === "auth_expired")
        cache.invalidate(key, token);
      throw error;
    }
  };

  return { getToken, withToken, clear: cache.clear };
};

const auth = createAuthClient(webshare);
module.exports = {
  ...auth,
  clearTokenCache: auth.clear,
  createAuthClient,
  credentialKey,
  TOKEN_TTL_MS,
};
