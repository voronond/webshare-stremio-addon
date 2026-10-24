const needle = require("needle");
const { request, REQUEST_TIMEOUT_MS } = require("../src/request");

jest.mock("needle");

beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.useRealTimers());

test("aborts a stalled upstream request at the overall deadline", async () => {
  jest.useFakeTimers();
  needle.mockImplementation(() => new Promise(() => {}));
  const result = request("get", "https://upstream.example/");
  const rejection = expect(result).rejects.toMatchObject({ code: "ETIMEDOUT" });
  await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await rejection;
  expect(needle.mock.calls[0][3].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([null, {}, { statusCode: 503 }, { statusCode: 302 }])(
  "rejects invalid upstream HTTP responses: %p",
  async (response) => {
    needle.mockResolvedValue(response);
    await expect(
      request("get", "https://upstream.example/"),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  },
);

test("cleans up the deadline after successful and failed requests", async () => {
  jest.useFakeTimers();
  needle
    .mockResolvedValueOnce({ statusCode: 200, body: {} })
    .mockRejectedValueOnce(new Error("offline"));
  await request("get", "https://upstream.example/");
  expect(jest.getTimerCount()).toBe(0);
  await expect(request("get", "https://upstream.example/")).rejects.toThrow(
    "offline",
  );
  expect(jest.getTimerCount()).toBe(0);
});
