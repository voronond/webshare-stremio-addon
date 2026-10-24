const pkg = require("../package.json");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const webshare = require("./webshare");
const { findShowInfo, findShowInfoInTmdb } = require("./meta");
const express = require("express");
const path = require("path");
const landingTemplate = require("./html/landingTemplate");
const {
  AddonError,
  classifyError,
  getFailure,
  isFailureCode,
} = require("./errors");
const {
  recoveryStream,
  recoveryMeta,
  recoveryUrl,
  helpCode,
} = require("./recovery");
const installationTemplate = require("./html/installationTemplate");
const { host, url } = require("./env");
const { formatStreamPresentation } = require("./streamPresentation");
const { isPlayableFile } = require("./fileAvailability");
const { streamUrl } = require("./streamUrl");
const dev = process.argv.includes("--dev") == 1 ? "Dev" : "";

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
types = ["movie", "series"];
const manifest = {
  id: "community.coffei.webshare" + dev,
  version: pkg.version,
  resources: [
    { name: "stream", types, idPrefixes: ["tt", "coffei.webshare:", "tmdb:"] },
    { name: "catalog", types, idPrefixes: ["coffei.webshare:"] },
    { name: "meta", types, idPrefixes: ["coffei.webshare:"] },
  ],
  types: ["movie", "series"],
  name: "Webshare.cz" + dev,
  description: "Simple webshare.cz search and streaming.",
  catalogs: [
    {
      id: "direct",
      type: "movie",
      name: "Webshare Files",
      extra: [{ name: "search", isRequired: true }],
    },
  ],
  idPrefixes: ["tt", "coffei.webshare:"],
  behaviorHints: { configurable: true, configurationRequired: true },
  config: [
    {
      key: "login",
      type: "text",
      title: "Webshare.cz login - username or email",
      required: true,
    },
    {
      key: "password",
      type: "password",
      title: "Webshare.cz password",
      required: true,
    },
  ],
  stremioAddonsConfig: {
    issuer: "https://stremio-addons.net",
    signature:
      "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..mh4jFfQQrEq1Vy-pr9NTkQ.Gp2N-4Mf59lof0OvKVS2m046p7PjhChVHasVT05bGlpwAOiinwU9UX-Yu-8XsisAqYvfJkSJ25EdcOiL-vCMnj_vXRrhxFZQxJKex4_bqeHjdWvyNYJjqUF2oYpZ1XS3.hbgL1AJ03OOLQ0QlKhoy3w",
  },
};

const builder = new addonBuilder(manifest);

const getToken = async (config) => {
  if (
    typeof config.login !== "string" ||
    !config.login.trim() ||
    ![config.saltedPassword, config.password].some(
      (value) => typeof value === "string" && value,
    )
  ) {
    throw new AddonError("invalid_credentials");
  }
  if (config.saltedPassword) {
    return await webshare.login(config.login, config.saltedPassword);
  } else {
    const saltedPassword = await webshare.saltPassword(
      config.login,
      config.password,
    );
    return await webshare.login(config.login, saltedPassword);
  }
};

builder.defineStreamHandler(async function (args) {
  try {
    const code = helpCode(args.id);
    if (code)
      return {
        streams: [recoveryStream(new AddonError(code))],
        cacheMaxAge: 0,
      };
    if (args.id.startsWith("tt")) {
      const info = await findShowInfo(args.type, args.id);
      if (info) {
        const wsToken = await getToken(args.config || {});
        const streams = await webshare.search(info, wsToken);

        return { streams: streams };
      }
    } else if (args.id.startsWith("coffei.webshare:")) {
      const wsId = args.id.substring(16);
      const wsToken = await getToken(args.config || {});
      const info = await webshare.getById(wsId, wsToken);
      if (!isPlayableFile(info)) return { streams: [] };
      return {
        streams: [
          {
            ident: wsId,
            ...formatStreamPresentation(info),
            url: streamUrl(wsId, wsToken),
          },
        ],
      };
    } else if (args.id.startsWith("tmdb:")) {
      const id = args.id.substring(5);
      const info = await findShowInfoInTmdb(args.type, id);
      if (info) {
        const wsToken = await getToken(args.config || {});
        const streams = await webshare.search(info, wsToken);

        return { streams: streams };
      }
    } else {
      return { streams: [] };
    }
  } catch (error) {
    console.error("Stream request failed:", classifyError(error).code);
    return { streams: [recoveryStream(error)], cacheMaxAge: 0 };
  }
  return { streams: [] };
});

builder.defineCatalogHandler(async function (args) {
  try {
    const wsToken = await getToken(args.config || {});
    const streams = await webshare.directSearch(args.extra.search, wsToken);
    return {
      metas: streams.filter(isPlayableFile).map((s) => ({
        id: `coffei.webshare:${s.ident}`,
        name: s.name,
        poster: s.img || new URL("mystatic/logo.png", url).toString(),
        type: args.type,
      })),
      cacheMaxAge: 60 * 60 * 1000,
    };
  } catch (error) {
    const failure = classifyError(error);
    console.error("Catalog request failed:", failure.code);
    return { metas: [recoveryMeta(failure.code, args.type)], cacheMaxAge: 0 };
  }
});

builder.defineMetaHandler(async function (args) {
  try {
    const code = helpCode(args.id);
    if (code) return { meta: recoveryMeta(code, args.type), cacheMaxAge: 0 };
    if (args.id.startsWith("coffei.webshare:")) {
      const wsId = args.id.substring(16);
      const wsToken = await getToken(args.config || {});
      const info = await webshare.getById(wsId, wsToken);
      if (!isPlayableFile(info)) return { meta: {} };
      return Promise.resolve({
        meta: {
          id: args.id,
          type: args.type,
          name: info.name,
          poster: info.stripe,
          background: info.stripe,
          description: info.description,
          website: `https://webshare.cz/#/file/${wsId}`,
        },
      });
    } else {
      return Promise.resolve({ meta: {} });
    }
  } catch (error) {
    const failure = classifyError(error);
    console.error("Metadata request failed:", failure.code);
    return {
      meta: { ...recoveryMeta(failure.code, args.type), id: args.id },
      cacheMaxAge: 0,
    };
  }
});

const app = express();

// Add the Stremio router for handling addon endpoints - getRouter converts it to express routers
app.use(getRouter(builder.getInterface()));

// Add middleware for CORS support
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.send();
  } else {
    next();
  }
});

//!!! according to the docs, getRouter should provide landing page, but it doesn't for some reason, so I created a custom landing page routers

// Serve static files from SDK (required for the configuration page)
const sdkPath = path.dirname(require.resolve("stremio-addon-sdk/package.json"));
app.use("/static", express.static(path.join(sdkPath, "static")));
app.use("/mystatic/", express.static(path.join(__dirname, "static")));

// Add middleware to decode FORM requests
app.use(express.urlencoded({ extended: true }));

// Add root route to serve the landing page
app.get(["/configure", "/"], (req, res) => {
  const error = isFailureCode(req.query.reason)
    ? getFailure(req.query.reason)
    : undefined;
  const landingHTML = landingTemplate(manifest, error, {}, req.query.lang);
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  res.setHeader("content-type", "text/html");
  res.end(landingHTML);
});

// Verify credentials and show an installation handoff with a manual fallback.
app.post("/configure", async (req, res) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  const { login, password, install } = req.body;
  let salted;
  let token;
  let failure;
  try {
    if (
      typeof login !== "string" ||
      !login.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      throw new AddonError("invalid_credentials");
    }
    salted = await webshare.saltPassword(login, password);
    token = await webshare.login(login, salted);
    if (!token) throw new AddonError("service_unavailable");
  } catch (error) {
    failure = classifyError(error);
    console.error("Configuration failed:", failure.code);
  }
  if (token) {
    const config = { login, saltedPassword: salted };

    const manifestPath = `${encodeURIComponent(JSON.stringify(config))}/manifest.json`;
    const httpManifestUrl = new URL(manifestPath, url).toString();

    const desktopUrl = `stremio://${host}/${manifestPath}`;
    const webUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(httpManifestUrl)}`;

    const html = installationTemplate(
      manifest,
      { httpManifestUrl, desktopUrl, webUrl },
      req.body.lang,
      install === "web" ? "web" : "desktop",
    );
    res.type("html").send(html);
  } else {
    const landingHTML = landingTemplate(
      manifest,
      failure,
      req.body,
      req.body.lang,
      true,
    );
    res.set("Cache-Control", "no-store");
    res.setHeader("content-type", "text/html");
    res.end(landingHTML);
  }
});

// Custom getUrl endpoint
app.get("/getUrl/:ident", async (req, res) => {
  try {
    const ident = req.params.ident;
    const url = await webshare.getUrl(ident, req.query.token);
    let playbackUrl;
    try {
      playbackUrl = new URL(url);
    } catch (e) {}
    if (!playbackUrl || !["http:", "https:"].includes(playbackUrl.protocol)) {
      throw new AddonError("service_unavailable");
    }

    const now = new Date();
    // Expires 5 hours from now.
    const expiration = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    res.set("Expires", expiration.toUTCString());
    res.set("Last-Modified", now.toUTCString());
    res.set(
      "Cache-Control",
      "max-age=18000, must-revalidate, proxy-revalidate",
    );

    res.redirect(url);
  } catch (error) {
    const failure = classifyError(error);
    console.error("Playback request failed:", failure.code);
    res
      .status(failure.status)
      .set("Cache-Control", "no-store")
      .json({
        error: failure.message,
        code: failure.code,
        help: recoveryUrl(failure.code),
      });
  }
});

module.exports = app;
