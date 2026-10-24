const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const landingTemplate = require("../src/html/landingTemplate");
const { escapeHtml } = require("../src/html/setupCopy");
const { getFailure } = require("../src/errors");

const manifest = {
  name: "Webshare.cz",
  version: "0.7.5",
  config: [
    { key: "login", type: "text", title: "Login", required: true },
    { key: "password", type: "password", title: "Password", required: true },
  ],
};

describe("accessible, localized setup page", () => {
  test.each([
    ["invalid_credentials", "Přihlašovací údaje nejsou správné."],
    ["account_restricted", "Účet Webshare je omezený nebo zablokovaný."],
    ["auth_expired", "Přihlášení k Webshare vypršelo."],
    ["timeout", "Služba neodpověděla včas."],
    ["service_unavailable", "Služba je dočasně nedostupná."],
    ["file_missing", "Soubor již není dostupný."],
    ["file_locked", "Soubor vyžaduje samostatné heslo."],
    ["file_unavailable", "Webshare nyní nemůže tento soubor přehrát."],
    ["file_private", "Webshare neumožňuje přístup k tomuto souboru."],
    ["download_limit", "Na vašich zařízeních probíhá příliš mnoho stahování."],
  ])("localizes the recovery guidance for %s", (code, expected) => {
    const html = landingTemplate(manifest, getFailure(code), {}, "cs");
    expect(html).toContain(expected);
    expect(html).not.toContain(getFailure(code).message);
    expect(html.includes('aria-invalid="true"')).toBe(
      code === "invalid_credentials",
    );
  });

  test("explains Premium requirements, setup steps, and recovery before installation", () => {
    const html = landingTemplate(manifest);
    expect(html).toContain("active Webshare Premium account");
    expect(html.indexOf("active Webshare Premium")).toBeLessThan(
      html.indexOf("<form"),
    );
    expect(html).toContain("Webshare Files");
    expect(html).toContain(
      "Return here to configure and install the addon again",
    );
    expect(html).toContain("installation link contains account credentials");
    expect(html).toContain('value="desktop">Install in Stremio app');
    expect(html).toContain('value="web">Install in Stremio Web');
  });

  test("has a mobile viewport, accessible names, native validation and password-manager hints", () => {
    const html = landingTemplate(manifest);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(
      'name="viewport" content="width=device-width, initial-scale=1"',
    );
    expect(html).toContain(
      '<label for="login">Webshare username or email</label>',
    );
    expect(html).toContain('<label for="password">Webshare password</label>');
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('autocomplete="current-password" required');
    expect(html).toContain('alt="Webshare addon logo"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain('aria-controls="password" aria-pressed="false"');
    const css = fs.readFileSync(
      path.join(__dirname, "../src/static/configure.css"),
      "utf8",
    );
    expect(css).toContain(":focus-visible");
    expect(css).toContain("max-width: 38rem");
    expect(css).not.toMatch(/\dvh/);
  });

  test("supports Czech and falls back safely for unknown language parameters", () => {
    const html = landingTemplate(manifest, true, {}, "cs");
    expect(html).toContain('<html lang="cs">');
    expect(html).toContain('name="lang" value="cs"');
    expect(html).toContain("aktivní účet Webshare Premium");
    expect(html).toContain("Přihlašovací údaje nejsou správné.");
    expect(html).toContain(
      'href="/configure?lang=cs" lang="cs" aria-current="page"',
    );
    expect(landingTemplate(manifest, null, {}, ["cs"])).toContain(
      '<html lang="en">',
    );
  });

  test("escapes submitted usernames and manifest attributes without redisplaying passwords", () => {
    const attack = '\"><img src=x onerror="alert(1)">';
    const html = landingTemplate(
      { ...manifest, name: attack, contactEmail: attack },
      { message: attack },
      {
        login: attack,
        password: "secret-never-render",
        saltedPassword: "hash-never-render",
      },
    );
    expect(html).not.toContain(attack);
    expect(html).toContain(escapeHtml(attack));
    expect(html).not.toContain("secret-never-render");
    expect(html).not.toContain("hash-never-render");
    expect(html).toContain('name="password" value=""');
    expect(html).toContain('id="setup-error" role="alert" tabindex="-1"');
    expect(html).toContain(
      'aria-invalid="true" aria-describedby="setup-error"',
    );
  });

  test("restores submitted select, number, and checkbox values instead of defaults", () => {
    const html = landingTemplate(
      {
        ...manifest,
        config: [
          ...manifest.config,
          {
            key: "quality",
            type: "select",
            title: "Quality",
            default: "720p",
            options: ["720p", "1080p"],
          },
          { key: "size", type: "number", title: "Size", default: 5 },
          {
            key: "extra",
            type: "checkbox",
            title: "Extra",
            default: "checked",
          },
        ],
      },
      true,
      { quality: "1080p", size: 0, extra: false },
    );
    expect(html).toContain('<option value="1080p" selected>1080p</option>');
    expect(html).not.toContain('<option value="720p" selected');
    expect(html).toContain('name="size" value="0"');
    expect(html).not.toContain('name="extra" checked');
  });

  test("does not recheck an omitted checkbox after a failed form submission", () => {
    const checkboxManifest = {
      ...manifest,
      config: [
        { key: "extra", type: "checkbox", title: "Extra", default: "checked" },
      ],
    };
    expect(landingTemplate(checkboxManifest)).toContain('name="extra" checked');
    const html = landingTemplate(
      checkboxManifest,
      true,
      { login: "user" },
      "en",
      true,
    );
    expect(html).toContain('name="extra"');
    expect(html).not.toContain('name="extra" checked');
  });

  test("escapes select values, labels and input identifiers", () => {
    const attack = '\" onfocus="alert(1)';
    const html = landingTemplate({
      ...manifest,
      config: [
        {
          key: attack,
          type: "select",
          title: attack,
          options: [{ value: attack, label: "<script>bad</script>" }],
        },
      ],
    });
    expect(html).not.toContain(attack);
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
  });
});

function setupClient() {
  const formListeners = {};
  const windowListeners = {};
  const passwordListeners = {};
  const submitButtons = [
    { value: "desktop", disabled: false },
    { value: "web", disabled: false },
  ];
  const status = { textContent: "" };
  const input = { type: "password" };
  const toggle = {
    hidden: true,
    dataset: {
      passwordTarget: "password",
      show: "Show password",
      hide: "Hide password",
    },
    setAttribute: jest.fn(),
    addEventListener: (name, listener) => {
      passwordListeners[name] = listener;
    },
  };
  const form = {
    dataset: { checking: "Checking your account…" },
    querySelectorAll: () => submitButtons,
    addEventListener: (name, listener) => {
      formListeners[name] = listener;
    },
    appendChild: jest.fn(),
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
  };
  const error = { focus: jest.fn() };
  const document = {
    getElementById: (id) =>
      ({
        mainForm: form,
        password: input,
        "setup-status": status,
        "setup-error": error,
      })[id],
    querySelectorAll: () => [toggle],
    createElement: () => ({ remove: jest.fn() }),
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/static/configure.js"), "utf8"),
    {
      document,
      window: {
        addEventListener: (name, listener) => {
          windowListeners[name] = listener;
        },
      },
    },
  );
  return {
    form,
    formListeners,
    windowListeners,
    passwordListeners,
    submitButtons,
    status,
    toggle,
    input,
    error,
  };
}

describe("setup interaction", () => {
  test("shows and hides the password with an announced pressed state", () => {
    const page = setupClient();
    expect(page.toggle.hidden).toBe(false);
    page.passwordListeners.click();
    expect(page.input.type).toBe("text");
    expect(page.toggle.textContent).toBe("Hide password");
    expect(page.toggle.setAttribute).toHaveBeenLastCalledWith(
      "aria-pressed",
      "true",
    );
    page.passwordListeners.click();
    expect(page.input.type).toBe("password");
    expect(page.toggle.textContent).toBe("Show password");
  });

  test("prevents duplicate submission and preserves the chosen install destination", () => {
    const page = setupClient();
    page.formListeners.submit({ submitter: page.submitButtons[1] });
    expect(page.submitButtons.every((button) => button.disabled)).toBe(true);
    expect(page.form.appendChild.mock.calls[0][0]).toMatchObject({
      type: "hidden",
      name: "install",
      value: "web",
    });
    expect(page.form.setAttribute).toHaveBeenCalledWith("aria-busy", "true");
    expect(page.status.textContent).toBe("Checking your account…");
    const event = { preventDefault: jest.fn() };
    page.formListeners.submit(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(page.form.appendChild).toHaveBeenCalledTimes(1);
  });

  test("recovers controls after navigating back and permits a fresh submission", () => {
    const page = setupClient();
    page.formListeners.submit({});
    expect(page.form.appendChild.mock.calls[0][0].value).toBe("desktop");
    page.windowListeners.pageshow();
    expect(page.submitButtons.every((button) => !button.disabled)).toBe(true);
    expect(page.status.textContent).toBe("");
    expect(page.form.appendChild.mock.calls[0][0].remove).toHaveBeenCalled();
    page.formListeners.submit({ submitter: page.submitButtons[1] });
    expect(page.form.appendChild).toHaveBeenCalledTimes(2);
    expect(page.error.focus).toHaveBeenCalled();
  });
});
