const needle = require("needle");

const REQUEST_TIMEOUT_MS = 10000;

// Needle supports phase timeouts and AbortSignal; also bound the entire request.
// https://github.com/tomas/needle#request-options
const request = async (method, url, data = null, options = {}) => {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("The upstream service took too long to respond.");
      error.code = "ETIMEDOUT";
      reject(error);
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      Promise.resolve().then(() =>
        needle(method, url, data, {
          open_timeout: 5000,
          response_timeout: REQUEST_TIMEOUT_MS,
          read_timeout: REQUEST_TIMEOUT_MS,
          ...options,
          signal: controller.signal,
        }),
      ),
      deadline,
    ]);
    if (
      !Number.isInteger(response?.statusCode) ||
      response.statusCode < 200 ||
      response.statusCode >= 300
    ) {
      const error = new Error(
        "The upstream service returned an invalid response.",
      );
      error.code = "UPSTREAM_ERROR";
      error.statusCode = response?.statusCode;
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { request, REQUEST_TIMEOUT_MS };
