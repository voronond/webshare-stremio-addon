const copy = {
  en: {
    language: "Language",
    intro: "Watch movies and series from Webshare in Stremio.",
    heading: "Connect your Webshare account",
    premium: "You need an active Webshare Premium account to stream files.",
    account: "Manage your Webshare account",
    steps: [
      "Sign in with your Webshare username or email and password.",
      "Install the addon in the Stremio app or Stremio Web.",
      "Open a movie or episode in Stremio and choose a Webshare stream.",
    ],
    login: "Webshare username or email",
    password: "Webshare password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    desktop: "Install in Stremio app",
    web: "Install in Stremio Web",
    checking: "Checking your account…",
    credentials: "Login credentials are incorrect.",
    retry: "Check your details and try again. Your password has been cleared.",
    retryService:
      "Follow the guidance above and try again. Your password has been cleared.",
    help: "Need help?",
    noStreams:
      "No streams? Try another title or search Webshare Files in Stremio. Results are matched from filenames and can be incorrect.",
    update:
      "Changed your Webshare password? Return here to configure and install the addon again.",
    privacy:
      "Your installation link contains account credentials. Keep it private and remove it from screenshots or support requests.",
    report: "Get help or report a problem",
    logo: "Webshare addon logo",
  },
  cs: {
    language: "Jazyk",
    intro: "Sledujte filmy a seriály z Webshare ve Stremiu.",
    heading: "Připojte svůj účet Webshare",
    premium:
      "Pro přehrávání souborů potřebujete aktivní účet Webshare Premium.",
    account: "Spravovat účet Webshare",
    steps: [
      "Přihlaste se uživatelským jménem nebo e-mailem a heslem k Webshare.",
      "Nainstalujte doplněk do aplikace Stremio nebo Stremio Web.",
      "Ve Stremiu otevřete film nebo epizodu a vyberte zdroj Webshare.",
    ],
    login: "Uživatelské jméno nebo e-mail Webshare",
    password: "Heslo Webshare",
    showPassword: "Zobrazit heslo",
    hidePassword: "Skrýt heslo",
    desktop: "Nainstalovat do aplikace Stremio",
    web: "Nainstalovat do Stremio Web",
    checking: "Ověřujeme váš účet…",
    credentials: "Přihlašovací údaje nejsou správné.",
    retry: "Zkontrolujte údaje a zkuste to znovu. Heslo bylo vymazáno.",
    retryService:
      "Postupujte podle pokynů výše a zkuste to znovu. Heslo bylo vymazáno.",
    failures: {
      invalid_credentials:
        "Přihlašovací údaje nejsou správné. Zkontrolujte uživatelské jméno nebo e-mail a heslo a doplněk znovu nainstalujte.",
      account_restricted:
        "Účet Webshare je omezený nebo zablokovaný. Přihlaste se na Webshare.cz nebo kontaktujte podporu Webshare a potom to zkuste znovu.",
      auth_expired:
        "Přihlášení k Webshare vypršelo. Zadejte aktuální přihlašovací údaje a doplněk znovu nainstalujte.",
      timeout:
        "Služba neodpověděla včas. Zkuste to za chvíli znovu nebo vyberte jiný zdroj.",
      service_unavailable:
        "Služba je dočasně nedostupná. Zkuste to za chvíli znovu nebo vyberte jiný zdroj. Pokud se přihlášení opakovaně nedaří, zkontrolujte účet na Webshare.cz.",
      file_missing:
        "Soubor již není dostupný. Vraťte se do Stremia a vyberte jiný zdroj.",
      file_locked:
        "Soubor vyžaduje samostatné heslo. Vraťte se do Stremia a vyberte jiný zdroj.",
      file_unavailable:
        "Webshare nyní nemůže tento soubor přehrát. Zkuste to později nebo vyberte jiný zdroj.",
      file_private:
        "Webshare neumožňuje přístup k tomuto souboru. Vraťte se do Stremia a vyberte jiný zdroj.",
      download_limit:
        "Na vašich zařízeních probíhá příliš mnoho stahování. Zastavte jiné stahování a potom to zkuste znovu.",
    },
    help: "Potřebujete pomoc?",
    noStreams:
      "Žádné zdroje? Zkuste jiný titul nebo ve Stremiu vyhledejte Webshare Files. Výsledky vycházejí z názvů souborů a mohou být nepřesné.",
    update:
      "Změnili jste heslo Webshare? Zde doplněk znovu nastavte a nainstalujte.",
    privacy:
      "Instalační odkaz obsahuje přihlašovací údaje. Uchovávejte jej v soukromí a odstraňte jej ze snímků obrazovky a žádostí o pomoc.",
    report: "Pomoc a hlášení problémů",
    logo: "Logo doplňku Webshare",
  },
};

const normalizeLanguage = (language) => (language === "cs" ? "cs" : "en");
const getCopy = (language) => copy[normalizeLanguage(language)];
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

module.exports = { getCopy, normalizeLanguage, escapeHtml };
