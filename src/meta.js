let tmdbPrivateKey;
try {
  tmdbPrivateKey = require("../config/keys").tmdbApiKey;
} catch (e) {}

const { request } = require("./request");
const { AddonError } = require("./errors");

const getTmdbKey = async () => {
  const key = tmdbPrivateKey || (await require("freekeys")())?.tmdb_key;
  if (!key) throw new Error("TMDB metadata is temporarily unavailable.");
  return key;
};

const parseId = (type, id) => {
  if (type === "movie") return { id };
  if (type !== "series") return null;
  const [seriesId, series, episode, extra] = id.split(":");
  if (extra || !seriesId || !/^\d+$/.test(series) || !/^\d+$/.test(episode)) {
    return null;
  }
  return { id: seriesId, series, episode };
};

const findInCinemeta = async (type, parsedId) => {
  const resp = await request(
    "get",
    `https://v3-cinemeta.strem.io/meta/${type}/${parsedId.id}.json`,
  );
  const meta = resp.body?.meta;
  if (meta === null) return null;
  if (typeof meta?.name !== "string" || !meta.name.trim())
    throw new AddonError("service_unavailable");
  return {
    name: meta.name,
    originalName: null,
    type,
    ...(type === "series"
      ? { series: parsedId.series, episode: parsedId.episode, year: null }
      : { year: meta.releaseInfo }),
  };
};

const findInTmdb = async (type, parsedId, byImdb) => {
  const key = await getTmdbKey();
  const base = byImdb
    ? `find/${parsedId.id}`
    : `${type === "series" ? "tv" : "movie"}/${parsedId.id}`;
  const endpoint = `https://api.themoviedb.org/3/${base}?api_key=${encodeURIComponent(key)}${byImdb ? "&external_source=imdb_id" : ""}`;
  const titleKey = type === "series" ? "name" : "title";
  const fetchTitle = async (language) => {
    const resp = await request(
      "get",
      endpoint + (language ? `&language=${language}` : ""),
    );
    let result = resp.body;
    if (byImdb) {
      const results =
        resp.body?.[type === "series" ? "tv_results" : "movie_results"];
      if (!Array.isArray(results))
        throw new Error("Invalid TMDB metadata response.");
      if (!results.length) return null;
      result = results[0];
    }
    if (typeof result?.[titleKey] !== "string" || !result[titleKey].trim()) {
      throw new Error("Invalid TMDB metadata response.");
    }
    return result;
  };

  // An optional translation must not make a usable title unavailable.
  const translations = await Promise.allSettled([
    fetchTitle("cs"),
    fetchTitle("sk"),
  ]);
  const [cs, sk] = translations.map((result) =>
    result.status === "fulfilled" ? result.value : null,
  );
  const primary = cs || sk;
  if (!primary) {
    if (translations.some((result) => result.status === "fulfilled"))
      return null;
    throw translations[0].reason;
  }
  let en;
  if (primary.original_language !== "en") {
    try {
      en = await fetchTitle();
    } catch (e) {
      // Preserve the localized and original titles when English lookup fails.
    }
  }
  return {
    name: primary[titleKey],
    nameSk: sk?.[titleKey],
    nameEn: en?.[titleKey],
    originalName:
      primary[type === "series" ? "original_name" : "original_title"],
    type,
    ...(type === "series"
      ? { series: parsedId.series, episode: parsedId.episode, year: null }
      : { year: primary.release_date?.substring(0, 4) }),
  };
};

const findShowInfo = async (type, id) => {
  const parsedId = parseId(type, id);
  if (!parsedId) return null;
  try {
    const result = await findInTmdb(type, parsedId, true);
    if (result) return result;
  } catch (e) {
    // Cinemeta remains available when keys, TMDB or a translation fail.
  }
  return findInCinemeta(type, parsedId);
};

const findShowInfoInTmdb = async (type, id) => {
  const parsedId = parseId(type, id);
  return parsedId ? findInTmdb(type, parsedId, false) : null;
};

module.exports = { findShowInfo, findShowInfoInTmdb };
