const failures = {
  invalid_credentials: {
    title: "Check your Webshare login",
    message:
      "Login credentials are incorrect. Check your username or email and password, then install the addon again.",
    status: 401,
  },
  account_restricted: {
    title: "Check your Webshare account",
    message:
      "Webshare has restricted or disabled this account. Sign in at Webshare.cz or contact Webshare support before trying again.",
    status: 403,
  },
  auth_expired: {
    title: "Reconnect your Webshare account",
    message:
      "Your Webshare authentication has expired. Enter your current credentials and install the addon again.",
    status: 401,
  },
  timeout: {
    title: "Webshare took too long to respond",
    message:
      "A service took too long to respond. Try again shortly or choose another stream.",
    status: 504,
  },
  service_unavailable: {
    title: "Service temporarily unavailable",
    message:
      "A service is temporarily unavailable. Try again shortly or choose another stream. You do not need to change your password.",
    status: 502,
  },
  file_missing: {
    title: "File no longer available",
    message:
      "This file is no longer available. Return to Stremio and choose another stream.",
    status: 404,
  },
  file_locked: {
    title: "File needs a separate password",
    message:
      "This file needs a separate file password. Return to Stremio and choose another stream.",
    status: 403,
  },
  file_unavailable: {
    title: "File temporarily unavailable",
    message:
      "Webshare cannot serve this file right now. Try again later or choose another stream.",
    status: 503,
  },
  file_private: {
    title: "File is not public",
    message:
      "Webshare does not allow access to this file. Return to Stremio and choose another stream.",
    status: 403,
  },
  download_limit: {
    title: "Webshare download limit reached",
    message:
      "Too many downloads are running on your devices. Stop another download, then try again.",
    status: 429,
  },
};

const isFailureCode = (code) =>
  typeof code === "string" && Object.hasOwn(failures, code);
const getFailure = (code) => {
  const safeCode = isFailureCode(code) ? code : "service_unavailable";
  return { code: safeCode, ...failures[safeCode] };
};

class AddonError extends Error {
  constructor(code) {
    const failure = getFailure(code);
    super(failure.message);
    this.code = failure.code;
  }
}

const classifyError = (error) => {
  if (error instanceof AddonError) return getFailure(error.code);
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT", "ABORT_ERR"].includes(error?.code))
    return getFailure("timeout");
  return getFailure("service_unavailable");
};

// Match documented API codes, never upstream message text.
// https://webshare.cz/apidoc/
const webshareCodes = {
  SALT_FATAL_1: "invalid_credentials",
  LOGIN_FATAL_2: "account_restricted",
  LOGIN_FATAL_3: "account_restricted",
  FILE_INFO_FATAL_1: "file_missing",
  FILE_INFO_FATAL_2: "file_locked",
  FILE_INFO_FATAL_3: "file_private",
  FILE_LINK_FATAL_1: "file_missing",
  FILE_LINK_FATAL_3: "file_locked",
  FILE_LINK_FATAL_4: "file_unavailable",
  FILE_LINK_FATAL_5: "download_limit",
  FILE_LINK_FATAL_6: "file_private",
};

const valueOf = (children, name) =>
  children.find((node) => node?.name === name)?.value;
const requireValue = (children, name) => {
  const value = valueOf(children, name);
  if (typeof value !== "string" || !value.trim())
    throw new AddonError("service_unavailable");
  return value;
};
const readWebshareResponse = (response) => {
  const children = response?.body?.children;
  if (!Array.isArray(children)) throw new AddonError("service_unavailable");
  const status = valueOf(children, "status");
  if (status !== "OK") {
    const code = valueOf(children, "code");
    throw new AddonError(
      Object.hasOwn(webshareCodes, code)
        ? webshareCodes[code]
        : "service_unavailable",
    );
  }
  return children;
};

module.exports = {
  AddonError,
  classifyError,
  getFailure,
  isFailureCode,
  readWebshareResponse,
  requireValue,
  valueOf,
};
