const { getCopy, normalizeLanguage, escapeHtml } = require("./setupCopy");

function installationTemplate(
  manifest,
  links,
  language,
  preferred = "desktop",
) {
  const lang = normalizeLanguage(language);
  const text = getCopy(lang);
  const actions = [
    { key: "desktop", url: links.desktopUrl, label: text.openDesktop },
    { key: "web", url: links.webUrl, label: text.openWeb },
  ].sort((a) => (a.key === preferred ? -1 : 1));

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${text.ready} - ${escapeHtml(manifest.name)}</title>
  <link rel="icon" href="/mystatic/logo.png" type="image/png">
  <link rel="stylesheet" href="/mystatic/configure.css">
  <script src="/mystatic/installation.js" defer></script>
</head>
<body>
  <main id="addon">
    <header><img class="logo" src="/mystatic/logo.png" width="80" height="80" alt="${text.logo}"><h1>${text.ready}</h1></header>
    <p>${text.readyDetail}</p>
    <div class="actions installation-actions">${actions.map((action) => `<a id="open-${action.key}" class="button${action.key === preferred ? "" : " secondary"}" href="${escapeHtml(action.url)}" rel="noreferrer noopener">${action.label}</a>`).join("")}</div>
    <p>${text.finishInstall}</p>
    <section aria-labelledby="manual-heading">
      <h2 id="manual-heading">${text.manualHeading}</h2>
      <p id="manual-instructions">${text.manualInstructions}</p>
      <label for="installation-link">${text.installationLink}</label>
      <textarea id="installation-link" rows="4" readonly spellcheck="false" aria-describedby="manual-instructions link-privacy">${escapeHtml(links.httpManifestUrl)}</textarea>
      <button id="copy-installation-link" type="button" data-copying="${escapeHtml(text.copying)}" data-copied="${escapeHtml(text.copied)}" data-manual="${escapeHtml(text.manualCopy)}" hidden>${text.copyLink}</button>
      <p id="copy-status" class="status" role="status" aria-live="polite"></p>
    </section>
    <p class="privacy" id="link-privacy">${text.privacy}</p>
    <p><a href="/configure?lang=${lang}">${text.backToSetup}</a></p>
  </main>
</body>
</html>`;
}

module.exports = installationTemplate;
