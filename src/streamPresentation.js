const { filesize } = require("filesize");

// Filename metadata is useful for choosing a stream, but does not verify its
// audio tracks, picture quality, or availability.
const formatStreamPresentation = (item, { strongMatch } = {}) => {
  const filename = item.filename || item.name;
  const parsedTitle = item.parsedTitle || {};
  const size = Number(item.size);
  const sizeLabel =
    item.size != null && item.size !== "" && Number.isFinite(size) && size >= 0
      ? filesize(size)
      : "Size unknown";
  const name = ["Webshare", parsedTitle.resolution, item.language, sizeLabel]
    .filter(Boolean)
    .join(" · ");
  const details = [filename];
  if (item.language) {
    details.push(`🌐 ${item.language} (inferred from filename)`);
  }
  details.push(`👍 ${item.posVotes ?? 0} 👎 ${item.negVotes ?? 0}`);
  details.push(`💾 ${sizeLabel}`);
  if (typeof strongMatch === "boolean") {
    details.push(
      `${strongMatch ? "Likely" : "Possible"} title match (based on filename)`,
    );
  }

  return {
    name,
    description: details.filter(Boolean).join("\n"),
    behaviorHints: {
      bingeGroup:
        "WebshareStremio|" +
        item.language +
        "|" +
        parsedTitle.resolution +
        "|" +
        parsedTitle.source,
      videoSize: item.size,
      filename,
    },
  };
};

module.exports = { formatStreamPresentation };
