const webshare = require("../src/webshare");
const needle = require("needle");

jest.mock("needle");

const fields = (values) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const file = (ident, availability = {}) => ({
  name: "file",
  children: fields({
    ident,
    name: "Example.2024.1080p.CZ.mkv",
    size: "2000000000",
    positive_votes: "5",
    negative_votes: "1",
    ...availability,
  }),
});
const info = (availability = {}) => ({
  statusCode: 200,
  body: {
    children: fields({
      status: "OK",
      name: "Example.S01E02.1080p.CZ.mkv",
      size: "2000000000",
      positive_votes: "5",
      negative_votes: "1",
      description: "Description",
      ...availability,
    }),
  },
});

describe("Webshare file availability", () => {
  beforeEach(() => jest.resetAllMocks());

  it.each(["direct", "automatic"])(
    "filters known unplayable files in %s search while retaining omitted flags",
    async (mode) => {
      needle.mockResolvedValue({
        statusCode: 200,
        body: {
          children: [
            ...fields({ status: "OK" }),
            file("protected", { password: "1" }),
            {
              name: "file",
              children: fields({ ident: "removed", removed: "1" }),
            },
            file("unavailable", { available: "0" }),
            file("no-flags"),
            file("available", { password: "0", removed: "0", available: "1" }),
          ],
        },
      });

      const result =
        mode === "direct"
          ? await webshare.directSearch("Example", "token")
          : await webshare.search(
              { originalName: "Example", type: "movie", year: "2024" },
              "token",
            );

      expect(result.map((item) => item.ident)).toEqual([
        "no-flags",
        "available",
      ]);
    },
  );

  it.each([
    ["password protected", { password: "1" }],
    ["removed", { removed: "1" }],
    ["unavailable", { available: "0" }],
  ])("rejects current file info marked %s", async (_, state) => {
    needle.mockResolvedValue(info(state));

    await expect(webshare.getById("ident", "token")).resolves.toBeNull();
    expect(needle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["FILE_INFO_FATAL_1", "file_missing"],
    ["FILE_INFO_FATAL_2", "file_locked"],
    ["FILE_INFO_FATAL_3", "file_private"],
  ])("does not return playable info for %s", async (code, expectedCode) => {
    needle.mockResolvedValue({
      statusCode: 200,
      body: { children: fields({ status: "FATAL", code }) },
    });

    await expect(webshare.getById("ident", "token")).rejects.toMatchObject({
      code: expectedCode,
    });
  });

  it("retains the raw filename and correct episode information for playable files", async () => {
    needle.mockResolvedValue(
      info({ password: "0", removed: "0", available: "1" }),
    );

    const result = await webshare.getById("ident", "token");

    expect(result).toMatchObject({
      ident: "ident",
      filename: "Example.S01E02.1080p.CZ.mkv",
      name: "Example S01E02",
      size: 2000000000,
      language: "CZ",
      protected: false,
      removed: false,
      available: true,
      SeasonEpisode: { season: 1, episode: 2 },
      parsedTitle: { resolution: "1080p" },
    });
    expect(needle).toHaveBeenCalledTimes(1);
    expect(needle.mock.calls[0].slice(0, 2)).toEqual([
      "post",
      "https://webshare.cz/api/file_info/",
    ]);
    expect(new URLSearchParams(needle.mock.calls[0][2]).get("ident")).toBe(
      "ident",
    );
  });

  it("does not conceal malformed service responses as unavailable files", async () => {
    needle.mockResolvedValue({ statusCode: 200, body: "upstream error" });

    await expect(webshare.getById("ident", "token")).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });
});
