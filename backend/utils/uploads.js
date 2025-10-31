const fs = require("fs");
const path = require("path");
const objectStorage = require("../services/objectStorage");

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

const toRelativePath = (...segments) =>
  segments
    .map((segment) => String(segment || "").trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

const buildPublicPath = (...segments) => {
  const rel = toRelativePath(...segments);
  return rel ? `/uploads/${rel}` : "/uploads";
};

async function syncToObjectStorage({ relativePath, absolutePath, contentType }) {
  if (!relativePath || !absolutePath) return null;
  try {
    if (!objectStorage.isConfigured()) return null;
    await objectStorage.uploadFile({
      relativePath,
      filePath: absolutePath,
      contentType,
    });
    return true;
  } catch (err) {
    console.error("[uploads] Failed to sync to object storage:", err?.message || err);
    return false;
  }
}

async function removeFromObjectStorage(relativePath) {
  if (!relativePath) return false;
  try {
    if (!objectStorage.isConfigured()) return false;
    return await objectStorage.deleteObject(relativePath);
  } catch (err) {
    console.error("[uploads] Failed to delete from object storage:", err?.message || err);
    return false;
  }
}

async function getSignedUrl(relativePath, options = {}) {
  if (!relativePath) return null;
  try {
    if (!objectStorage.isConfigured()) return null;
    return await objectStorage.getSignedUrlFor(relativePath, options);
  } catch (err) {
    console.error("[uploads] Failed to generate signed url:", err?.message || err);
    return null;
  }
}

function removeLocalFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("[uploads] Failed to remove local file:", filePath, err?.message || err);
  }
}

module.exports = {
  uploadRoot,
  ensureDirSync,
  toRelativePath,
  buildPublicPath,
  syncToObjectStorage,
  removeFromObjectStorage,
  getSignedUrl,
  removeLocalFile,
};
