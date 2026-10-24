const needle = require("needle");
const webshare = require("../src/webshare");

jest.mock("needle");

const info = {
  name: "Example",
  originalName: "Example",
  type: "movie",
  year: "2024",
};
const file = {
  name: "file",
  children: [
    { name: "ident", value: "123" },
    { name: "name", value: "Example.2024.1080p.mkv" },
    { name: "size", value: "2000000000" },
    { name: "positive_votes", value: "1" },
    { name: "negative_votes", value: "0" },
  ],
};
const response = (children) => ({
  statusCode: 200,
  body: { children: [{ name: "status", value: "OK" }, ...children] },
});

beforeEach(() => jest.resetAllMocks());

test("keeps playable results when another localized query fails", async () => {
  needle
    .mockRejectedValueOnce(new Error("query failed"))
    .mockResolvedValueOnce(response([file]));
  await expect(webshare.search(info, "token")).resolves.toEqual([
    expect.objectContaining({ ident: "123" }),
  ]);
});

test("throws when every query fails", async () => {
  needle.mockRejectedValue(new Error("service offline"));
  await expect(webshare.search(info, "token")).rejects.toThrow(
    "service offline",
  );
});

test("preserves a genuine no-results response", async () => {
  needle.mockResolvedValue(response([{ name: "status", value: "OK" }]));
  await expect(webshare.search(info, "token")).resolves.toEqual([]);
});

test.each([
  { statusCode: 503, body: { children: [] } },
  { statusCode: 200, body: {} },
  {
    statusCode: 200,
    body: {
      children: [
        { name: "status", value: "FATAL" },
        { name: "code", value: "UNKNOWN_ERROR" },
      ],
    },
  },
])(
  "does not report upstream failures as a successful empty search",
  async (result) => {
    needle.mockResolvedValue(result);
    await expect(webshare.search(info, "token")).rejects.toThrow();
  },
);
