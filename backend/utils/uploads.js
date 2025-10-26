const fs = require("fs");
const path = require("path");

const resolveRoot = () => {
  const customRoot = process.env.UPLOAD_ROOT;
  if (customRoot) {
    const absolute = path.isAbsolute(customRoot) ? customRoot : path.resolve(process.cwd(), customRoot);
    fs.mkdirSync(absolute, { recursive: true });
    return absolute;
  }
  const fallback = path.join(__dirname, "..", "uploads");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
};

const uploadRoot = resolveRoot();

const ensureDirSync = (...segments) => {
  const dir = path.join(uploadRoot, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const buildPublicPath = (...segments) => `/uploads/${segments.join("/")}`;

module.exports = {
  uploadRoot,
  ensureDirSync,
  buildPublicPath,
};
