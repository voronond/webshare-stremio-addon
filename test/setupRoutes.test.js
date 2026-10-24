const request = require("supertest");
const webshare = require("../src/webshare");
const landingTemplate = require("../src/html/landingTemplate");
const app = require("../src/addon");
jest.mock("../src/html/landingTemplate", () =>
  jest.fn(jest.requireActual("../src/html/landingTemplate")),
);
jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({ findShowInfo: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test("GET configure renders Czech with accessible fields and a retained language", async () => {
  const response = await request(app).get("/configure?lang=cs").expect(200);
  expect(response.text).toContain('<html lang="cs">');
  expect(response.text).toContain('name="lang" value="cs"');
  expect(response.text).toContain('label for="login"');
});

test("GET Czech recovery preserves the actual failure without blaming credentials", async () => {
  const response = await request(app)
    .get("/configure?lang=cs&reason=timeout")
    .expect(200);
  expect(response.text).toContain("Služba neodpověděla včas.");
  expect(response.text).not.toContain("Přihlašovací údaje nejsou správné.");
  expect(response.text).not.toContain('aria-invalid="true"');
});

test("failed configuration preserves the selected language and safely retains the username", async () => {
  const login = '\"><script>alert(1)</script>';
  webshare.saltPassword.mockRejectedValueOnce(new Error("unavailable"));
  const response = await request(app)
    .post("/configure")
    .type("form")
    .send({ login, password: "never-redisplay-me", lang: "cs" })
    .expect(200);
  expect(response.text).toContain('<html lang="cs">');
  expect(response.text).toContain("Služba je dočasně nedostupná.");
  expect(response.text).not.toContain('aria-invalid="true"');
  expect(response.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(response.text).not.toContain(login);
  expect(response.text).not.toContain("never-redisplay-me");
});

test("setup assets are served locally without depending on external stylesheets", async () => {
  const response = await request(app).get("/").expect(200);
  expect(response.text).toContain('href="/mystatic/configure.css"');
  expect(response.text).not.toContain("fonts.googleapis.com");
  await request(app).get("/mystatic/configure.css").expect(200);
  await request(app).get("/mystatic/configure.js").expect(200);
});

test("failed configuration marks the render as submitted so omitted checkboxes stay unchecked", async () => {
  webshare.saltPassword.mockRejectedValueOnce(new Error("unavailable"));
  await request(app)
    .post("/configure")
    .type("form")
    .send({ login: "user", password: "secret", lang: "en" })
    .expect(200);
  expect(landingTemplate).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ code: "service_unavailable" }),
    { login: "user", password: "secret", lang: "en" },
    "en",
    true,
  );
});
