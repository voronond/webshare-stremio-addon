const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const request = require("supertest");
const webshare = require("../src/webshare");
const app = require("../src/addon");
const installationTemplate = require("../src/html/installationTemplate");

jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({ findShowInfo: jest.fn() }));

const decodeHtml = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
const manifestLink = (html) =>
  decodeHtml(html.match(/<textarea[^>]*>([^<]+)<\/textarea>/)[1]);

beforeEach(() => jest.clearAllMocks());

describe("installation handoff", () => {
  test.each(["desktop", "web"])(
    "offers explicit app, web and manual actions with %s first",
    async (install) => {
      webshare.saltPassword.mockResolvedValueOnce("salted-verifier");
      webshare.login.mockResolvedValueOnce("token");
      const response = await request(app)
        .post("/configure")
        .type("form")
        .send({
          login: "user",
          password: "raw-password-do-not-serialize",
          install,
        })
        .expect(200);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.text).toContain("Your addon is ready");
      expect(response.text).toContain(`id="open-${install}" class="button"`);
      const secondary = install === "web" ? "desktop" : "web";
      expect(response.text.indexOf(`id="open-${install}"`)).toBeLessThan(
        response.text.indexOf(`id="open-${secondary}"`),
      );
      expect(response.text).toContain("Open Stremio app");
      expect(response.text).toContain("Open Stremio Web");
      expect(response.text).toContain('rel="noreferrer noopener"');
      expect(response.text).toContain('readonly spellcheck="false"');
      expect(response.text).toContain("copy it manually");
      expect(response.text).toContain("contains account credentials");
      expect(response.text).not.toContain("raw-password-do-not-serialize");
      expect(response.text).not.toContain('http-equiv="refresh"');
    },
  );

  test("round-trips special-character usernames through every installation destination", async () => {
    const login = 'žluťoučký+name&"<>' + "'@example.cz";
    webshare.saltPassword.mockResolvedValueOnce("salted-verifier");
    webshare.login.mockResolvedValueOnce("token");
    const response = await request(app)
      .post("/configure")
      .type("form")
      .send({
        login,
        password: "raw-password-do-not-serialize",
        install: "web",
        lang: "cs",
      })
      .expect(200);
    expect(response.text).toContain('<html lang="cs">');
    expect(response.text).toContain("Váš doplněk je připraven");
    expect(response.text).not.toContain(login);
    const httpUrl = manifestLink(response.text);
    const config = JSON.parse(
      decodeURIComponent(new URL(httpUrl).pathname.split("/")[1]),
    );
    expect(config).toEqual({ login, saltedPassword: "salted-verifier" });
    const desktopUrl = decodeHtml(
      response.text.match(/id="open-desktop"[^>]*href="([^"]+)"/)[1],
    );
    expect(new URL(desktopUrl).pathname).toBe(new URL(httpUrl).pathname);
    const webUrl = new URL(
      decodeHtml(response.text.match(/id="open-web"[^>]*href="([^"]+)"/)[1]),
    );
    expect(webUrl.origin).toBe("https://web.stremio.com");
    expect(new URLSearchParams(webUrl.hash.split("?")[1]).get("addon")).toBe(
      httpUrl,
    );
  });

  test.each(["/", "/configure", "/configure?lang=cs"])(
    "does not cache or send a referrer from %s",
    async (url) => {
      const response = await request(app).get(url).expect(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    },
  );

  test("also protects failed configuration responses", async () => {
    webshare.saltPassword.mockRejectedValueOnce(new Error("unavailable"));
    const response = await request(app)
      .post("/configure")
      .type("form")
      .send({ login: "user", password: "secret" })
      .expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.text).not.toContain("secret");
  });

  test("escapes template data and uses only local assets", () => {
    const html = installationTemplate(
      { name: "<script>bad()</script>" },
      {
        desktopUrl: 'stremio://host/a" onclick="bad()',
        webUrl: "https://web.stremio.com/",
        httpManifestUrl: "</textarea><script>bad()</script>",
      },
      "en",
    );
    expect(html).not.toContain("<script>bad()</script>");
    expect(html).toContain("&lt;/textarea&gt;");
    expect(html).toContain("a&quot; onclick=&quot;bad()");
    expect(html).toContain('src="/mystatic/installation.js"');
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)="https?:/);
    expect(html).toContain('id="copy-installation-link"');
    expect(html).toContain('role="status" aria-live="polite"');
  });
});

function setupClipboard(clipboard) {
  let click;
  const button = {
    hidden: true,
    disabled: false,
    dataset: {
      copying: "Copying…",
      copied: "Copied",
      manual: "Select and copy manually",
    },
    addEventListener: (event, listener) => {
      click = listener;
    },
  };
  const link = {
    value: "https://addon.example/private/manifest.json",
    focus: jest.fn(),
    select: jest.fn(),
  };
  const status = { textContent: "old status" };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../src/static/installation.js"),
      "utf8",
    ),
    {
      document: {
        getElementById: (id) =>
          ({
            "copy-installation-link": button,
            "installation-link": link,
            "copy-status": status,
          })[id],
      },
      navigator: { clipboard },
    },
  );
  return { button, link, status, click: () => click() };
}

describe("copy installation link", () => {
  test("announces success only after clipboard writing completes", async () => {
    let finish;
    const writeText = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const page = setupClipboard({ writeText });
    expect(page.button.hidden).toBe(false);
    const pending = page.click();
    expect(page.button.disabled).toBe(true);
    expect(page.status.textContent).toBe("Copying…");
    expect(writeText).toHaveBeenCalledWith(page.link.value);
    await page.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(page.status.textContent).toBe("Copied");
    expect(page.button.disabled).toBe(false);
    expect(page.link.select).not.toHaveBeenCalled();
  });

  test("selects the link with manual instructions if clipboard permission is denied", async () => {
    const page = setupClipboard({
      writeText: jest.fn().mockRejectedValue(new Error("denied")),
    });
    await page.click();
    expect(page.link.focus).toHaveBeenCalled();
    expect(page.link.select).toHaveBeenCalled();
    expect(page.status.textContent).toBe("Select and copy manually");
    expect(page.button.disabled).toBe(false);
  });

  test("supports manual copy when the Clipboard API is unavailable", async () => {
    const page = setupClipboard(undefined);
    await page.click();
    expect(page.link.select).toHaveBeenCalled();
    expect(page.status.textContent).toBe("Select and copy manually");
  });

  test("replaces an old success announcement when a subsequent copy fails", async () => {
    const writeText = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    const page = setupClipboard({ writeText });
    await page.click();
    expect(page.status.textContent).toBe("Copied");
    await page.click();
    expect(page.status.textContent).toBe("Select and copy manually");
  });
});
