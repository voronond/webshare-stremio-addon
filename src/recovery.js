const { classifyError, getFailure, isFailureCode } = require("./errors");
const { url } = require("./env");

const HELP_PREFIX = "coffei.webshare:help:";
const recoveryUrl = (code) =>
  new URL(`configure?reason=${getFailure(code).code}`, url).toString();
const recoveryStream = (error) => {
  const failure = classifyError(error);
  // externalUrl is a supported browser action, not a pretend playable stream.
  // stremio-addon-sdk/docs/api/responses/stream.md
  return {
    name: `Webshare: ${failure.title}`,
    description: `${failure.message}\nOpen help and account setup.`,
    externalUrl: recoveryUrl(failure.code),
  };
};
const recoveryMeta = (code, type = "movie") => {
  const failure = getFailure(code);
  return {
    id: HELP_PREFIX + failure.code,
    type,
    name: `Webshare: ${failure.title}`,
    description: failure.message,
    poster: new URL("mystatic/logo.png", url).toString(),
    website: recoveryUrl(failure.code),
  };
};
const helpCode = (id) => {
  if (!id.startsWith(HELP_PREFIX)) return null;
  const code = id.slice(HELP_PREFIX.length);
  return isFailureCode(code) ? code : "service_unavailable";
};

module.exports = { recoveryStream, recoveryMeta, recoveryUrl, helpCode };
