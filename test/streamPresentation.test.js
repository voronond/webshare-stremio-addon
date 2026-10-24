const { formatStreamPresentation } = require("../src/streamPresentation");

describe("stream presentation", () => {
  const item = {
    name: "Example.S01E02.1080p.WEB-DL.CZ.EN.mkv",
    language: "CZ|EN",
    size: 2100000000,
    posVotes: 12,
    negVotes: 2,
    parsedTitle: { resolution: "1080p", source: "WEB-DL" },
  };

  it("offers a compact choice while retaining filename, votes and playback hints", () => {
    const stream = formatStreamPresentation(item, { strongMatch: true });

    expect(stream.name).toBe("Webshare · 1080p · CZ|EN · 2.1 GB");
    expect(stream.description.split("\n")).toEqual([
      item.name,
      "🌐 CZ|EN (inferred from filename)",
      "👍 12 👎 2",
      "💾 2.1 GB",
      "Likely title match (based on filename)",
    ]);
    expect(stream.behaviorHints).toEqual({
      bingeGroup: "WebshareStremio|CZ|EN|1080p|WEB-DL",
      videoSize: 2100000000,
      filename: item.name,
    });
    expect(stream.name).not.toContain("✅");
  });

  it("does not invent language or resolution when filenames do not identify them", () => {
    const stream = formatStreamPresentation({
      name: "Example.mkv",
      language: null,
      size: "2000000000",
    });

    expect(stream.name).toBe("Webshare · 2 GB");
    expect(stream.description).not.toMatch(/🌐|inferred|match|undefined|null/);
    expect(stream.description).toContain("Example.mkv");
    expect(stream.behaviorHints.filename).toBe("Example.mkv");
  });

  it("keeps subtitle language distinct from audio language", () => {
    const stream = formatStreamPresentation({
      ...item,
      language: "CZ titulky|EN",
    });

    expect(stream.name).toContain("CZ titulky|EN");
    expect(stream.description).toContain(
      "🌐 CZ titulky|EN (inferred from filename)",
    );
    expect(stream.name).not.toContain("CZ audio");
  });

  it("describes uncertain matches without implying playback has been checked", () => {
    const stream = formatStreamPresentation(item, { strongMatch: false });

    expect(stream.description).toContain(
      "Possible title match (based on filename)",
    );
    expect(stream.description).not.toMatch(/Likely|verified|✅/);
  });

  it.each([undefined, null, "", "invalid", -1, Infinity])(
    "handles unavailable file size %s without a misleading number",
    (size) => {
      const stream = formatStreamPresentation({ ...item, size });

      expect(stream.name).toBe("Webshare · 1080p · CZ|EN · Size unknown");
      expect(stream.description).toContain("💾 Size unknown");
    },
  );

  it("retains the original filename when the display title is simplified", () => {
    const stream = formatStreamPresentation({
      ...item,
      name: "Example S01E02",
      filename: item.name,
    });

    expect(stream.description.split("\n")[0]).toBe(item.name);
    expect(stream.behaviorHints.filename).toBe(item.name);
  });
});
