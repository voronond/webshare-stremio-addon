const { clearTokenCache } = require("../src/auth");
beforeEach(() => clearTokenCache());
const request = require("supertest");
const webshare = require("../src/webshare");
const app = require("../src/addon");
const { findShowInfo, findShowInfoInTmdb } = require("../src/meta");
jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({
  findShowInfo: jest.fn(),
  findShowInfoInTmdb: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

test("the manifest exposes supported string options and the setup has localized constraints/help", async () => {
  const manifest = await request(app).get("/manifest.json").expect(200);
  expect(
    manifest.body.config.find((field) => field.key === "preferredLanguage")
      .options,
  ).toEqual(["any", "CZ", "SK", "EN"]);
  expect(
    manifest.body.config.find((field) => field.key === "maxResolution").options,
  ).toEqual(["any", "720p", "1080p", "2160p"]);
  const page = await request(app).get("/configure?lang=cs").expect(200);
  expect(page.text).toContain("Preferovaný jazyk zvuku");
  expect(page.text).toContain('<option value="CZ">Čeština</option>');
  expect(page.text).toContain(
    'min="0.1" max="1000" step="any" inputmode="decimal"',
  );
  expect(page.text).toContain(
    "Soubory s neznámým rozlišením zůstanou dostupné",
  );
  expect(page.text).toContain("neověřujeme zvukové stopy");
});

test("saves normalized validated preferences in the installation config", async () => {
  webshare.saltPassword.mockResolvedValueOnce("salted");
  webshare.login.mockResolvedValueOnce("token");
  const response = await request(app)
    .post("/configure")
    .type("form")
    .send({
      login: "user",
      password: "secret",
      preferredLanguage: "CZ",
      maxResolution: "1080p",
      maxFileSizeGb: "1.25",
    })
    .expect(200);
  const url = response.text.match(/<textarea[^>]*>([^<]+)<\/textarea>/)[1];
  const config = JSON.parse(
    decodeURIComponent(new URL(url).pathname.split("/")[1]),
  );
  expect(config).toEqual({
    login: "user",
    saltedPassword: "salted",
    preferredLanguage: "CZ",
    maxResolution: "1080p",
    maxFileSizeGb: 1.25,
  });
  expect(response.text).not.toContain("secret");
});

test("restores preferences and Czech after failed authentication", async () => {
  webshare.saltPassword.mockRejectedValueOnce(new Error("unavailable"));
  const response = await request(app)
    .post("/configure")
    .type("form")
    .send({
      login: "user",
      password: "secret",
      lang: "cs",
      preferredLanguage: "SK",
      maxResolution: "720p",
      maxFileSizeGb: "2.5",
    })
    .expect(200);
  expect(response.text).toContain('<html lang="cs">');
  expect(response.text).toContain(
    '<option value="SK" selected>Slovenština</option>',
  );
  expect(response.text).toContain(
    '<option value="720p" selected>720p (HD)</option>',
  );
  expect(response.text).toContain('name="maxFileSizeGb" value="2.5"');
  expect(response.text).toContain('name="password" value=""');
});

test.each([
  { preferredLanguage: "DE" },
  { maxResolution: "9999p" },
  { maxFileSizeGb: "Infinity" },
  { maxFileSizeGb: "1001" },
  { maxFileSizeGb: ["1", "2"] },
  { preferredLanguage: { value: "CZ" } },
])(
  "rejects invalid posted preferences %p before authenticating",
  async (preferences) => {
    const response = await request(app)
      .post("/configure")
      .type("form")
      .send({
        login: "user",
        password: "secret",
        lang: "cs",
        ...preferences,
      })
      .expect(400);
    expect(webshare.saltPassword).not.toHaveBeenCalled();
    expect(response.text).toContain("Zkontrolujte nastavení zdrojů");
    expect(response.text).toContain('aria-invalid="true"');
    expect(response.text).not.toContain("secret");
    expect(response.headers["cache-control"]).toBe("no-store");
  },
);

test.each(["tt123", "tmdb:123"])(
  "passes stored preferences to search for %s",
  async (id) => {
    const info = {
      name: "Movie",
      originalName: "Movie",
      type: "movie",
      year: "2024",
    };
    findShowInfo.mockResolvedValue(info);
    findShowInfoInTmdb.mockResolvedValue(info);
    webshare.login.mockResolvedValueOnce("token");
    webshare.search.mockResolvedValueOnce([]);
    const config = encodeURIComponent(
      JSON.stringify({
        login: "user",
        saltedPassword: "salted",
        preferredLanguage: "SK",
        maxResolution: "720p",
        maxFileSizeGb: "2",
      }),
    );
    await request(app)
      .get(`/${config}/stream/movie/${encodeURIComponent(id)}.json`)
      .expect(200);
    expect(webshare.search).toHaveBeenCalledWith(info, "token", {
      preferredLanguage: "SK",
      maxResolution: "720p",
      maxFileSizeGb: 2,
    });
  },
);

test("normalizes malformed preferences in an old or externally edited installation", async () => {
  const info = {
    name: "Movie",
    originalName: "Movie",
    type: "movie",
    year: "2024",
  };
  findShowInfo.mockResolvedValue(info);
  webshare.login.mockResolvedValueOnce("token");
  webshare.search.mockResolvedValueOnce([]);
  const config = encodeURIComponent(
    JSON.stringify({
      login: "user",
      saltedPassword: "salted",
      preferredLanguage: ["CZ"],
      maxResolution: "fake",
      maxFileSizeGb: "Infinity",
    }),
  );
  await request(app).get(`/${config}/stream/movie/tt123.json`).expect(200);
  expect(webshare.search).toHaveBeenCalledWith(info, "token", {
    preferredLanguage: "any",
    maxResolution: "any",
    maxFileSizeGb: null,
  });
});
