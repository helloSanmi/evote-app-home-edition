const fs = require("fs");
const path = require("path");

const resolveRoot = () => {
  const customRoot = process.env.UPLOAD_ROOT;
  if (customRoot) {
    try {
      const absolute = path.isAbsolute(customRoot) ? customRoot : path.resolve(process.cwd(), customRoot);
      fs.mkdirSync(absolute, { recursive: true });
      return absolute;
    } catch (err) {
      console.warn(`[uploads] Failed to prepare custom UPLOAD_ROOT (${customRoot}): ${err?.message || err}. Falling back to default ./backend/uploads.`);
    }
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
