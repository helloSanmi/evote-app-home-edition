const fs = require("fs");
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

let cachedClient = null;

const STORAGE_ENABLED = String(process.env.STORAGE_PROVIDER || "").trim().toLowerCase() === "s3";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE || "").toLowerCase() === "true";
const S3_PREFIX = String(process.env.S3_PREFIX || "").replace(/^\/+|\/+$/g, "");
const DEFAULT_URL_EXPIRY = Math.max(60, Number(process.env.S3_SIGNED_URL_EXPIRY || 15) * 60); // seconds

function isConfigured() {
  return (
    STORAGE_ENABLED &&
    S3_BUCKET &&
    S3_ENDPOINT &&
    S3_REGION &&
    S3_ACCESS_KEY_ID &&
    S3_SECRET_ACCESS_KEY
  );
}

function getClient() {
  if (!isConfigured()) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

function toKey(relativePath) {
  const normalized = String(relativePath || "").replace(/^\/+/, "");
  if (!normalized) return null;
  if (!S3_PREFIX) return normalized;
  return `${S3_PREFIX.replace(/\/+$/g, "")}/${normalized}`;
}

async function uploadFile({ filePath, relativePath, contentType, metadata }) {
  if (!isConfigured()) return null;
  const client = getClient();
  if (!client) return null;
  const key = toKey(relativePath);
  if (!key) throw new Error("S3_UPLOAD_KEY_MISSING");
  const body = fs.createReadStream(filePath);
  const uploader = new Upload({
    client,
    params: {
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || undefined,
      Metadata: metadata || undefined,
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  });
  await uploader.done();
  return key;
}

async function deleteObject(relativePath) {
  if (!isConfigured()) return false;
  const client = getClient();
  if (!client) return false;
  const key = toKey(relativePath);
  if (!key) return false;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err?.name === "NoSuchKey") return false;
    console.error("[storage] deleteObject failed:", err?.message || err);
    throw err;
  }
}

async function getSignedUrlFor(relativePath, { expiresIn = DEFAULT_URL_EXPIRY } = {}) {
  if (!isConfigured()) return null;
  const client = getClient();
  if (!client) return null;
  const key = toKey(relativePath);
  if (!key) return null;
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

module.exports = {
  isConfigured,
  uploadFile,
  deleteObject,
  getSignedUrlFor,
  toKey,
};
