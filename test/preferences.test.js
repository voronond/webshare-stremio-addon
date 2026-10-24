const {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  validatePreferences,
  serializePreferences,
  withinLimits,
  comparePreferredLanguage,
} = require("../src/preferences");

describe("preference validation and compatibility", () => {
  test.each([
    undefined,
    null,
    [],
    "CZ",
    5,
    { preferredLanguage: ["CZ"], maxResolution: {}, maxFileSizeGb: Infinity },
  ])(
    "invalid installed configuration %p falls back to unlimited defaults",
    (value) => expect(normalizePreferences(value)).toEqual(DEFAULT_PREFERENCES),
  );

  test("normalizes form strings and only serializes nondefault settings", () => {
    expect(
      normalizePreferences({
        preferredLanguage: "CZ",
        maxResolution: "1080p",
        maxFileSizeGb: " 1.25 ",
      }),
    ).toEqual({
      preferredLanguage: "CZ",
      maxResolution: "1080p",
      maxFileSizeGb: 1.25,
    });
    expect(serializePreferences({})).toEqual({});
    expect(
      serializePreferences({
        preferredLanguage: "any",
        maxResolution: "any",
        maxFileSizeGb: "",
      }),
    ).toEqual({});
    expect(
      serializePreferences({ preferredLanguage: "SK", maxFileSizeGb: "2" }),
    ).toEqual({ preferredLanguage: "SK", maxFileSizeGb: 2 });
  });

  test.each([0.1, "0.1", ".5", "1.", "1.25", 1000, "1000"])(
    "accepts file size %p including the boundaries",
    (value) => {
      expect(
        validatePreferences({ maxFileSizeGb: value }).invalidFields,
      ).toEqual([]);
    },
  );

  test.each([
    -1,
    0,
    "0",
    "0.099",
    1000.001,
    "1001",
    Infinity,
    NaN,
    "Infinity",
    "1e2",
    "0x10",
    "2GB",
    ["1"],
    {},
    true,
  ])("rejects malformed or out-of-range file size %p", (value) => {
    expect(validatePreferences({ maxFileSizeGb: value }).invalidFields).toEqual(
      ["maxFileSizeGb"],
    );
    expect(
      normalizePreferences({ maxFileSizeGb: value }).maxFileSizeGb,
    ).toBeNull();
  });

  test.each([null, undefined, ""])(
    "accepts an omitted optional file-size limit %p",
    (value) => {
      expect(
        validatePreferences({ maxFileSizeGb: value }).invalidFields,
      ).toEqual([]);
      expect(
        normalizePreferences({ maxFileSizeGb: value }).maxFileSizeGb,
      ).toBeNull();
    },
  );

  test("rejects unknown and structured choices rather than trusting submitted form values", () => {
    expect(
      validatePreferences({ preferredLanguage: ["CZ"], maxResolution: "9999p" })
        .invalidFields,
    ).toEqual(["preferredLanguage", "maxResolution"]);
    expect(
      validatePreferences({
        preferredLanguage: "DE",
        maxResolution: { value: "1080p" },
      }).invalidFields,
    ).toEqual(["preferredLanguage", "maxResolution"]);
  });
});

describe("known resolution and size limits", () => {
  test.each(["480p", "720p", "1080p", "1080i", 1080])(
    "retains known resolution %p up to the inclusive limit",
    (resolution) => {
      expect(
        withinLimits(
          { parsedTitle: { resolution } },
          { maxResolution: "1080p" },
        ),
      ).toBe(true);
    },
  );

  test.each(["2160p", "4K", "UHD", "8k"])(
    "excludes resolution %p above the limit",
    (resolution) => {
      expect(
        withinLimits(
          { parsedTitle: { resolution } },
          { maxResolution: "1080p" },
        ),
      ).toBe(false);
    },
  );

  test.each([undefined, null, "unknown", ""])(
    "retains unknown resolution %p with an active limit",
    (resolution) => {
      expect(
        withinLimits(
          { parsedTitle: { resolution } },
          { maxResolution: "720p" },
        ),
      ).toBe(true);
    },
  );

  test.each([
    [1.005, 1_005_000_000],
    [2.01, 2_010_000_000],
  ])(
    "rounds a %p GB cap to an inclusive integer-byte boundary",
    (maxFileSizeGb, bytes) => {
      expect(withinLimits({ size: bytes }, { maxFileSizeGb })).toBe(true);
      expect(withinLimits({ size: bytes + 1 }, { maxFileSizeGb })).toBe(false);
    },
  );

  test("uses decimal GB and an inclusive byte boundary", () => {
    expect(withinLimits({ size: 1_249_999_999 }, { maxFileSizeGb: 1.25 })).toBe(
      true,
    );
    expect(withinLimits({ size: 1_250_000_000 }, { maxFileSizeGb: 1.25 })).toBe(
      true,
    );
    expect(withinLimits({ size: 1_250_000_001 }, { maxFileSizeGb: 1.25 })).toBe(
      false,
    );
  });

  test.each([undefined, null, 0, -1, NaN, "unknown"])(
    "retains unknown file size %p",
    (size) => {
      expect(withinLimits({ size }, { maxFileSizeGb: 1 })).toBe(true);
    },
  );

  test("default and malformed installed limits preserve results", () => {
    const large = {
      parsedTitle: { resolution: "8k" },
      size: 5_000_000_000_000,
    };
    expect(withinLimits(large, {})).toBe(true);
    expect(
      withinLimits(large, { maxResolution: "fake", maxFileSizeGb: "bad" }),
    ).toBe(true);
  });
});

describe("preferred inferred audio within relevance groups", () => {
  const english = { strongMatch: true, match: 0.89, language: "EN" };
  const czech = { strongMatch: true, match: 0.87, language: "CZ|EN" };
  test("promotes a preferred language within the same relevance bucket", () => {
    expect(
      comparePreferredLanguage(czech, english, { preferredLanguage: "CZ" }),
    ).toBeLessThan(0);
    expect(
      comparePreferredLanguage(english, czech, { preferredLanguage: "CZ" }),
    ).toBeGreaterThan(0);
  });

  test("does not promote a weak match or a lower relevance bucket", () => {
    expect(
      comparePreferredLanguage(
        { ...czech, strongMatch: false, match: 0.49 },
        english,
        { preferredLanguage: "CZ" },
      ),
    ).toBe(0);
    expect(
      comparePreferredLanguage({ ...czech, match: 0.61 }, english, {
        preferredLanguage: "CZ",
      }),
    ).toBe(0);
  });

  test("subtitle tags do not count as preferred audio and unknown language is a fallback", () => {
    expect(
      comparePreferredLanguage(
        { ...czech, language: "CZ titulky|EN" },
        english,
        { preferredLanguage: "CZ" },
      ),
    ).toBe(0);
    expect(
      comparePreferredLanguage(
        czech,
        { ...english, language: null },
        { preferredLanguage: "CZ" },
      ),
    ).toBeLessThan(0);
    expect(
      comparePreferredLanguage({ ...czech, language: ["CZ"] }, english, {
        preferredLanguage: "CZ",
      }),
    ).toBe(0);
  });

  test("no preference preserves the existing comparator", () => {
    expect(comparePreferredLanguage(czech, english, {})).toBe(0);
  });
});
