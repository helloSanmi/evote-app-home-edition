const sql = require("mssql");

let poolPromise = null;

function normalizeParam(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date && Number.isFinite(value.getTime?.())) return value;
  return value ?? null;
}

async function getDbPool() {
  if (poolPromise) return poolPromise;
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 1433),
    options: {
      encrypt: process.env.DB_ENCRYPT ? process.env.DB_ENCRYPT !== "false" : true,
      trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    },
    pool: {
      max: Number(process.env.DB_POOL_MAX || 10),
      min: 0,
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 30000),
    },
  };
  poolPromise = sql.connect(config).catch((err) => {
    poolPromise = null;
    throw err;
  });
  return poolPromise;
}

async function q(text, params = []) {
  const pool = await getDbPool();
  const request = pool.request();
  let paramIndex = 0;
  const parsed = text.replace(/\?/g, () => {
    const name = `p${paramIndex}`;
    if (paramIndex >= params.length) throw new Error("Parameter count mismatch");
    request.input(name, normalizeParam(params[paramIndex]));
    paramIndex += 1;
    return `@${name}`;
  });
  if (paramIndex < params.length) throw new Error("Parameter count mismatch");
  const result = await request.query(parsed);
  return [result.recordset || [], result];
}

async function one(text, params = []) {
  const [rows] = await q(text, params);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getConn() {
  const pool = await getDbPool();
  return pool.request();
}

module.exports = { getDbPool, q, one, getConn };
