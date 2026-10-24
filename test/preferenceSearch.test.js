const webshare = require("../src/webshare");
const needle = require("needle");
jest.mock("needle");

const file = (ident, name, size = "1000000000", votes = "1") => ({
  name: "file",
  children: [
    { name: "ident", value: ident },
    { name: "name", value: name },
    { name: "size", value: size },
    { name: "positive_votes", value: votes },
    { name: "negative_votes", value: "0" },
  ],
});
const info = {
  name: "Miracle Man",
  originalName: "Miracle Man",
  year: "2024",
  type: "movie",
};
const respond = (files) =>
  needle.mockImplementation(() => ({
    statusCode: 200,
    body: { children: [{ name: "status", value: "OK" }, ...files] },
  }));

test("saved language preference changes the first relevant stream while retaining fallback languages", async () => {
  respond([
    file("english", "Miracle.Man.2024.1080p.EN.mkv", "1000000000", "100"),
    file(
      "subtitles",
      "Miracle.Man.2024.1080p.EN.CZ.titulky.mkv",
      "1000000000",
      "90",
    ),
    file("czech", "Miracle.Man.2024.1080p.CZ.mkv"),
    file("unknown", "Miracle.Man.2024.1080p.mkv", "1000000000", "0"),
  ]);
  const original = await webshare.search(info, "token");
  const explicitDefaults = await webshare.search(info, "token", {});
  expect(explicitDefaults.map((stream) => stream.ident)).toEqual(
    original.map((stream) => stream.ident),
  );
  expect(original[0].ident).toBe("english");
  const preferred = await webshare.search(info, "token", {
    preferredLanguage: "CZ",
  });
  expect(preferred.map((stream) => stream.ident)).toEqual([
    "czech",
    "english",
    "subtitles",
    "unknown",
  ]);
});

test("resolution and size limits filter known values and retain unknown metadata", async () => {
  respond([
    file("boundary", "Miracle.Man.2024.1080p.CZ.mkv", "1250000000"),
    file("too-large", "Miracle.Man.2024.1080p.CZ.mkv", "1250000001"),
    file("too-high", "Miracle.Man.2024.2160p.CZ.mkv"),
    file("unknown-resolution", "Miracle Man (2024) CZ.mkv"),
  ]);
  const streams = await webshare.search(info, "token", {
    maxResolution: "1080p",
    maxFileSizeGb: 1.25,
  });
  expect(streams.map((stream) => stream.ident).sort()).toEqual([
    "boundary",
    "unknown-resolution",
  ]);
});

test("preferences preserve exact movie-year and episode filtering", async () => {
  respond([
    file("correct", "Miracle.Man.2024.1080p.CZ.mkv"),
    file("wrong-year", "Miracle.Man.2023.1080p.CZ.mkv"),
  ]);
  expect(
    (await webshare.search(info, "token", { preferredLanguage: "CZ" })).map(
      (stream) => stream.ident,
    ),
  ).toEqual(["correct"]);
  respond([
    file("correct", "Miracle.Man.S01E02.1080p.CZ.mkv"),
    file("wrong-episode", "Miracle.Man.S01E03.1080p.CZ.mkv"),
    file("wrong-season", "Miracle.Man.S02E02.1080p.CZ.mkv"),
  ]);
  const streams = await webshare.search(
    { ...info, type: "series", series: "1", episode: "2" },
    "token",
    { preferredLanguage: "CZ" },
  );
  expect(streams.map((stream) => stream.ident)).toEqual(["correct"]);
});
