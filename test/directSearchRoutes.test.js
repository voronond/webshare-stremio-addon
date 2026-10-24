const request = require("supertest");
const webshare = require("../src/webshare");
const app = require("../src/addon");
const { url } = require("../src/env");
const { AddonError } = require("../src/errors");

jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({ findShowInfo: jest.fn() }));

describe("direct file search and playback", () => {
  const config = encodeURIComponent(
    JSON.stringify({ login: "user", saltedPassword: "password-digest" }),
  );
  const playable = {
    ident: "playable",
    name: "Example.2024.1080p.CZ.mkv",
    filename: "Example.2024.1080p.CZ.mkv",
    size: 2000000000,
    language: "CZ",
    parsedTitle: { resolution: "1080p", source: "WEB-DL" },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    webshare.login.mockResolvedValue("token");
  });

  it("excludes protected, removed and known unavailable catalog files", async () => {
    webshare.directSearch.mockResolvedValue([
      playable,
      { ...playable, ident: "protected", protected: true },
      { ...playable, ident: "removed", removed: "1" },
      { ...playable, ident: "unavailable", available: false },
      {
        ...playable,
        ident: "available",
        available: true,
        img: "https://example.com/poster.jpg",
      },
    ]);

    const response = await request(app)
      .get(`/${config}/catalog/movie/direct/search=example.json`)
      .expect(200);

    expect(response.body.metas.map((file) => file.id)).toEqual([
      "coffei.webshare:playable",
      "coffei.webshare:available",
    ]);
    expect(response.body.metas[0].poster).toBe(
      new URL("mystatic/logo.png", url).toString(),
    );
    expect(response.body.metas[1].poster).toBe(
      "https://example.com/poster.jpg",
    );
  });

  it.each([
    ["protected", { protected: true }],
    ["removed", { removed: true }],
    ["unavailable", { available: false }],
    ["non-public or missing", null],
  ])(
    "does not offer playback for a currently %s direct ID",
    async (_, state) => {
      webshare.getById.mockResolvedValue(state && { ...playable, ...state });

      const response = await request(app)
        .get(`/${config}/stream/movie/coffei.webshare%3Aplayable.json`)
        .expect(200);

      expect(response.body.streams).toEqual([]);
      expect(webshare.getById).toHaveBeenCalledWith("playable", "token");
      expect(webshare.getUrl).not.toHaveBeenCalled();
    },
  );

  it("checks fresh file info and gives direct playback the same labels and hints", async () => {
    const token = "token/+&?= value";
    const ident = "file/with?reserved=characters";
    webshare.login.mockResolvedValue(token);
    webshare.getById.mockResolvedValue(playable);

    const response = await request(app)
      .get(
        `/${config}/stream/movie/${encodeURIComponent(`coffei.webshare:${ident}`)}.json`,
      )
      .expect(200);

    const [stream] = response.body.streams;
    expect(webshare.getById).toHaveBeenCalledWith(ident, token);
    expect(stream.name).toBe("Webshare · 1080p · CZ · 2 GB");
    expect(stream.description).toContain(playable.filename);
    expect(stream.description).toContain("inferred from filename");
    expect(stream.description).not.toMatch(/title match|✅/);
    expect(stream.behaviorHints).toEqual({
      bingeGroup: "WebshareStremio|CZ|1080p|WEB-DL",
      filename: playable.filename,
      videoSize: playable.size,
    });
    const download = new URL(stream.url);
    expect(decodeURIComponent(download.pathname.split("/").pop())).toBe(ident);
    expect(download.searchParams.get("token")).toBe(token);
    expect([...download.searchParams.keys()]).toEqual(["token"]);
  });

  it("does not expose stale metadata for a file that is no longer playable", async () => {
    webshare.getById.mockResolvedValue(null);

    const response = await request(app)
      .get(`/${config}/meta/movie/coffei.webshare%3Aplayable.json`)
      .expect(200);

    expect(response.body.meta).toEqual({});
  });

  it.each(["file_missing", "file_locked", "file_private"])(
    "offers help without a playable URL when current file info reports %s",
    async (code) => {
      webshare.getById.mockRejectedValue(new AddonError(code));
      const response = await request(app)
        .get(`/${config}/stream/movie/coffei.webshare%3Aplayable.json`)
        .expect(200);
      expect(response.body.streams).toHaveLength(1);
      expect(response.body.streams[0].url).toBeUndefined();
      expect(response.body.streams[0].externalUrl).toContain(`reason=${code}`);
      expect(webshare.getUrl).not.toHaveBeenCalled();
    },
  );
});
