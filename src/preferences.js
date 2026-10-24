const LANGUAGE_OPTIONS = ["any", "CZ", "SK", "EN"];
const RESOLUTION_OPTIONS = ["any", "720p", "1080p", "2160p"];
const MIN_FILE_SIZE_GB = 0.1;
const MAX_FILE_SIZE_GB = 1000;
const DEFAULT_PREFERENCES = Object.freeze({
  preferredLanguage: "any",
  maxResolution: "any",
  maxFileSizeGb: null,
});

const getInput = (input) =>
  input && typeof input === "object" && !Array.isArray(input) ? input : {};
const isEmpty = (value) =>
  value === undefined || value === null || value === "";
const parseSize = (value) => {
  if (isEmpty(value)) return null;
  if (
    !["string", "number"].includes(typeof value) ||
    (typeof value === "string" &&
      !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
  ) {
    return NaN;
  }
  const size = Number(value);
  return Number.isFinite(size) &&
    size >= MIN_FILE_SIZE_GB &&
    size <= MAX_FILE_SIZE_GB
    ? size
    : NaN;
};

function normalizePreferences(input) {
  const values = getInput(input);
  const size = parseSize(values.maxFileSizeGb);
  return {
    preferredLanguage: LANGUAGE_OPTIONS.includes(values.preferredLanguage)
      ? values.preferredLanguage
      : "any",
    maxResolution: RESOLUTION_OPTIONS.includes(values.maxResolution)
      ? values.maxResolution
      : "any",
    maxFileSizeGb: Number.isFinite(size) ? size : null,
  };
}

function validatePreferences(input) {
  const values = getInput(input);
  const invalidFields = [];
  if (
    !isEmpty(values.preferredLanguage) &&
    !LANGUAGE_OPTIONS.includes(values.preferredLanguage)
  ) {
    invalidFields.push("preferredLanguage");
  }
  if (
    !isEmpty(values.maxResolution) &&
    !RESOLUTION_OPTIONS.includes(values.maxResolution)
  ) {
    invalidFields.push("maxResolution");
  }
  if (Number.isNaN(parseSize(values.maxFileSizeGb)))
    invalidFields.push("maxFileSizeGb");
  return { preferences: normalizePreferences(values), invalidFields };
}

function serializePreferences(input) {
  const preferences = normalizePreferences(input);
  return Object.fromEntries(
    Object.entries(preferences).filter(
      ([key, value]) => value !== DEFAULT_PREFERENCES[key],
    ),
  );
}

const resolutionHeight = (resolution) => {
  if (typeof resolution !== "string" && typeof resolution !== "number")
    return null;
  const text = String(resolution).toLowerCase();
  if (text === "4k" || text === "uhd") return 2160;
  if (text === "8k") return 4320;
  const match = text.match(/^(\d{3,4})[pi]?$/);
  return match ? Number(match[1]) : null;
};

function withinLimits(item, input) {
  const preferences = normalizePreferences(input);
  const height = resolutionHeight(
    item.parsedTitle?.resolution ?? item.resolution,
  );
  const maxHeight = resolutionHeight(preferences.maxResolution);
  if (height !== null && maxHeight !== null && height > maxHeight) return false;
  const size = Number(item.size ?? item.behaviorHints?.videoSize);
  const maxBytes =
    preferences.maxFileSizeGb === null
      ? null
      : Math.round(preferences.maxFileSizeGb * 1_000_000_000);
  if (
    maxBytes !== null &&
    Number.isFinite(size) &&
    size > 0 &&
    size > maxBytes
  ) {
    return false;
  }
  // Filename metadata can be missing; retain unknowns rather than hide potentially useful files.
  return true;
}

const hasPreferredAudio = (language, preferred) =>
  typeof language === "string" &&
  language.split("|").some((tag) => tag.trim().toUpperCase() === preferred);

function comparePreferredLanguage(a, b, input) {
  const { preferredLanguage } = normalizePreferences(input);
  if (
    preferredLanguage === "any" ||
    a.strongMatch !== b.strongMatch ||
    Math.floor(a.match * 10) !== Math.floor(b.match * 10)
  ) {
    return 0;
  }
  // Only promote audio within the same confidence and title-similarity bucket.
  // A tag such as "CZ titulky" describes subtitles and does not count as CZ audio.
  return (
    Number(hasPreferredAudio(b.language, preferredLanguage)) -
    Number(hasPreferredAudio(a.language, preferredLanguage))
  );
}

module.exports = {
  LANGUAGE_OPTIONS,
  RESOLUTION_OPTIONS,
  MIN_FILE_SIZE_GB,
  MAX_FILE_SIZE_GB,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  validatePreferences,
  serializePreferences,
  withinLimits,
  comparePreferredLanguage,
};
