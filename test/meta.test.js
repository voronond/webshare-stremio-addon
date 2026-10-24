const needle = require("needle");
const freekeys = require("freekeys");
const { findShowInfo, findShowInfoInTmdb } = require("../src/meta");

jest.mock("needle");
jest.mock("freekeys", () => jest.fn());

const movie = {
  title: "Test movie",
  original_title: "Test movie",
  original_language: "en",
  release_date: "2024-01-02",
};
const response = (body) => ({ statusCode: 200, body });

beforeEach(() => {
  jest.resetAllMocks();
  freekeys.mockResolvedValue({ tmdb_key: "test-key" });
});

describe("metadata provider recovery", () => {
  test.each([
    ["movie", "tt123", "movie_results", "Test movie"],
    ["series", "tt123:1:2", "tv_results", "Test series"],
  ])(
    "uses Cinemeta after empty TMDB %s results",
    async (type, id, resultKey, name) => {
      needle.mockImplementation((method, url) =>
        Promise.resolve(
          response(
            url.includes("themoviedb")
              ? { [resultKey]: [] }
              : { meta: { name, releaseInfo: "2024" } },
          ),
        ),
      );
      await expect(findShowInfo(type, id)).resolves.toMatchObject({
        name,
        type,
      });
      expect(
        needle.mock.calls.some((call) => call[1].includes("cinemeta")),
      ).toBe(true);
    },
  );

  test.each(["rejected", "missing"])(
    "uses Cinemeta with a %s free-key response",
    async (kind) => {
      if (kind === "rejected")
        freekeys.mockRejectedValue(new Error("key service offline"));
      else freekeys.mockResolvedValue({});
      needle.mockResolvedValue(
        response({ meta: { name: "Fallback", releaseInfo: "2024" } }),
      );
      await expect(findShowInfo("movie", "tt123")).resolves.toMatchObject({
        name: "Fallback",
      });
      expect(needle).toHaveBeenCalledTimes(1);
      expect(needle.mock.calls[0][1]).toContain("cinemeta");
    },
  );

  test("uses Cinemeta when TMDB rejects or returns malformed data", async () => {
    needle.mockImplementation((method, url) => {
      if (url.includes("language=cs"))
        return Promise.reject(new Error("TMDB offline"));
      return Promise.resolve(
        response(
          url.includes("themoviedb") ? {} : { meta: { name: "Fallback" } },
        ),
      );
    });
    await expect(findShowInfo("movie", "tt123")).resolves.toMatchObject({
      name: "Fallback",
    });
  });

  test("keeps a primary title when optional Slovak and English lookups fail", async () => {
    needle.mockImplementation((method, url) =>
      url.includes("language=cs")
        ? Promise.resolve(
            response({
              movie_results: [{ ...movie, original_language: "it" }],
            }),
          )
        : Promise.reject(new Error("translation offline")),
    );
    await expect(findShowInfo("movie", "tt123")).resolves.toMatchObject({
      name: "Test movie",
      originalName: "Test movie",
    });
    expect(needle.mock.calls.some((call) => call[1].includes("cinemeta"))).toBe(
      false,
    );
  });

  test("keeps a Slovak title when the Czech provider fails", async () => {
    needle.mockImplementation((method, url) =>
      url.includes("language=sk")
        ? Promise.resolve(response({ movie_results: [movie] }))
        : Promise.reject(new Error("Czech lookup offline")),
    );
    await expect(findShowInfo("movie", "tt123")).resolves.toMatchObject({
      name: "Test movie",
      nameSk: "Test movie",
    });
  });

  test("returns no metadata for a valid Cinemeta no-match response", async () => {
    needle.mockImplementation((method, url) =>
      Promise.resolve(
        response(
          url.includes("themoviedb") ? { movie_results: [] } : { meta: null },
        ),
      ),
    );
    await expect(findShowInfo("movie", "tt123")).resolves.toBeNull();
  });

  test("retains season and episode when looking up TMDB series IDs", async () => {
    needle.mockResolvedValue(
      response({
        name: "A show",
        original_name: "A show",
        original_language: "en",
      }),
    );
    await expect(
      findShowInfoInTmdb("series", "123:2:3"),
    ).resolves.toMatchObject({ name: "A show", series: "2", episode: "3" });
    expect(needle.mock.calls[0][1]).toContain("/tv/123?");
  });

  test("does not request malformed episode IDs", async () => {
    await expect(findShowInfo("series", "tt123:1")).resolves.toBeNull();
    expect(needle).not.toHaveBeenCalled();
  });
});

test("malformed Cinemeta data is a service failure rather than no metadata", async () => {
  needle.mockImplementation((method, url) =>
    Promise.resolve(
      response(
        url.includes("themoviedb")
          ? { movie_results: [] }
          : { service: "unavailable" },
      ),
    ),
  );
  await expect(findShowInfo("movie", "tt123")).rejects.toMatchObject({
    code: "service_unavailable",
  });
});
