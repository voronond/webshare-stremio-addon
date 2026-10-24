const { getCopy, normalizeLanguage, escapeHtml } = require("./setupCopy");

function landingTemplate(
  manifest,
  error,
  configValues = {},
  language = "en",
  submitted = false,
) {
  const lang = normalizeLanguage(language);
  const text = getCopy(lang);
  const credentialsInvalid = Boolean(
    error && (!error.code || error.code === "invalid_credentials"),
  );
  const errorMessage = error
    ? typeof error === "string"
      ? error
      : text.failures?.[error.code] || error.message || text.credentials
    : "";
  const fields = (manifest.config || [])
    .map((element) => {
      const key = escapeHtml(element.key);
      const title = escapeHtml(text[element.key] || element.title);
      const required = element.required ? " required" : "";
      const hasError = Boolean(
        credentialsInvalid && ["login", "password"].includes(element.key),
      );
      const errorAttributes = hasError
        ? ' aria-invalid="true" aria-describedby="setup-error"'
        : "";
      const value = configValues[element.key] ?? element.default ?? "";
      let control;
      if (["text", "number", "password"].includes(element.type)) {
        const autocomplete =
          element.key === "login"
            ? ' autocomplete="username" autocapitalize="none" spellcheck="false"'
            : element.type === "password"
              ? ' autocomplete="current-password"'
              : "";
        const inputValue = element.type === "password" ? "" : escapeHtml(value);
        control = `<input type="${element.type}" id="${key}" name="${key}" value="${inputValue}"${autocomplete}${required}${errorAttributes}>`;
        if (element.type === "password") {
          control += `<button class="password-toggle secondary" type="button" data-password-target="${key}" data-show="${escapeHtml(text.showPassword)}" data-hide="${escapeHtml(text.hidePassword)}" aria-controls="${key}" aria-pressed="false" hidden>${text.showPassword}</button>`;
        }
      } else if (element.type === "select") {
        const selectedValue = String(
          value || element.options?.[0]?.value || element.options?.[0] || "",
        );
        control = `<select id="${key}" name="${key}"${required}>${(
          element.options || []
        )
          .map((option) => {
            const optionValue =
              typeof option === "object" ? option.value : option;
            const label = typeof option === "object" ? option.label : option;
            return `<option value="${escapeHtml(optionValue)}"${String(optionValue) === selectedValue ? " selected" : ""}>${escapeHtml(label)}</option>`;
          })
          .join("")}</select>`;
      } else if (element.type === "checkbox") {
        const checked = Object.prototype.hasOwnProperty.call(
          configValues,
          element.key,
        )
          ? Boolean(configValues[element.key])
          : !submitted && element.default === "checked";
        return `<div class="form-element checkbox"><input type="checkbox" id="${key}" name="${key}"${checked ? " checked" : ""}${required}><label for="${key}">${title}</label></div>`;
      } else {
        return "";
      }
      return `<div class="form-element"><label for="${key}">${title}</label>${control}</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(manifest.name)} - Stremio Addon</title>
  <link rel="icon" href="/mystatic/logo.png" type="image/png">
  <link rel="stylesheet" href="/mystatic/configure.css">
  <script src="/mystatic/configure.js" defer></script>
</head>
<body>
  <main id="addon">
    <nav class="language" aria-label="${text.language}"><a href="/configure?lang=en" lang="en"${lang === "en" ? ' aria-current="page"' : ""}>English</a><a href="/configure?lang=cs" lang="cs"${lang === "cs" ? ' aria-current="page"' : ""}>Čeština</a></nav>
    <header><img class="logo" src="/mystatic/logo.png" width="80" height="80" alt="${text.logo}"><div><h1>${escapeHtml(manifest.name)}</h1><p class="version">v${escapeHtml(manifest.version || "0.0.0")}</p></div></header>
    <p>${text.intro}</p>
    <h2>${text.heading}</h2>
    <p class="notice">${text.premium} <a href="https://webshare.cz/">${text.account}</a></p>
    <ol>${text.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
    ${error ? `<div class="error" id="setup-error" role="alert" tabindex="-1"><p>${escapeHtml(errorMessage)}</p><p>${credentialsInvalid ? text.retry : text.retryService}</p></div>` : ""}
    ${
      fields
        ? `<form id="mainForm" action="/configure" method="POST" data-checking="${escapeHtml(text.checking)}">
      <input type="hidden" name="lang" value="${lang}">
      ${fields}
      <div class="actions"><button type="submit" name="install" value="desktop">${text.desktop}</button><button class="secondary" type="submit" name="install" value="web">${text.web}</button></div>
      <p id="setup-status" class="status" role="status" aria-live="polite"></p>
    </form>`
        : ""
    }
    <section class="help" aria-labelledby="help-heading"><h2 id="help-heading">${text.help}</h2><p>${text.noStreams}</p><p>${text.update}</p><a href="https://github.com/voronond/webshare-stremio-addon/issues">${text.report}</a></section>
    <p class="privacy">${text.privacy}</p>
    ${manifest.contactEmail ? `<p class="contact"><a href="mailto:${escapeHtml(manifest.contactEmail)}">${escapeHtml(manifest.contactEmail)}</a></p>` : ""}
  </main>
</body>
</html>`;
}

module.exports = landingTemplate;
