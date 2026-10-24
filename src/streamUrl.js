const { url } = require("./env");

const streamUrl = (ident, token) => {
  const stream = new URL(`getUrl/${encodeURIComponent(ident)}`, url);
  stream.searchParams.set("token", token);
  return stream.toString();
};

module.exports = { streamUrl };
