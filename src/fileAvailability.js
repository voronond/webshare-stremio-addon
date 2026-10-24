const isTrue = (value) => value === true || value === 1 || value === "1";
const isFalse = (value) => value === false || value === 0 || value === "0";

// The API's file_info flags are optional in search results. An omitted flag
// must not hide a potentially playable file. https://webshare.cz/apidoc/
const fileAvailability = (children) => {
  const value = (name) => children.find((field) => field.name === name)?.value;
  return {
    protected: isTrue(value("password")),
    removed: isTrue(value("removed")),
    available:
      value("available") == null ? undefined : !isFalse(value("available")),
  };
};

const isPlayableFile = (file) =>
  Boolean(file) &&
  !isTrue(file.protected) &&
  !isTrue(file.removed) &&
  !isFalse(file.available);

module.exports = { fileAvailability, isPlayableFile };
