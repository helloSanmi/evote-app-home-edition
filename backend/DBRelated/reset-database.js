#!/usr/bin/env node
/**
 * Utility to wipe the current MySQL schema and run migrations anew.
 * Usage: node backend/DBRelated/reset-database.js
 */

const fs = require("fs");
const path = require("path");

// Load env variables so db.js picks up credentials.
const envCandidates = [
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", "..", ".env"),
];
for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    require("dotenv").config({ path: candidate });
  }
}

const { getDbPool } = require("../db");
const { ensureSchema } = require("../dbMigrations");

async function dropAllTables(pool) {
  const [tables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE()"
  );
  const names = (tables || []).map((row) => row.TABLE_NAME || row.table_name).filter(Boolean);
  if (!names.length) {
    console.log("[reset-db] No tables found to drop.");
    return 0;
  }

  console.log(`[reset-db] Dropping ${names.length} tables...`);
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(`DROP TABLE IF EXISTS \`${name}\``);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS=1");
  console.log("[reset-db] Tables dropped.");
  return names.length;
}

async function main() {
  const pool = getDbPool();
  try {
    const count = await dropAllTables(pool);
    console.log(`[reset-db] ${count} table(s) removed.`);
    console.log("[reset-db] Re-running schema migrations...");
    await ensureSchema();
    console.log("[reset-db] Database ready with fresh schema.");
  } catch (err) {
    console.error("[reset-db] Failed to reset database:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[reset-db] Unhandled error:", err);
    process.exit(1);
  });
}

