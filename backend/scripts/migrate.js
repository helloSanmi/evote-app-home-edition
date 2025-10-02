#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const sql = require("mssql");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}

(async () => {
  const sqlPath = path.join(__dirname, "..", "DBRelated", "schema.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error(`Schema file not found at ${sqlPath}`);
    process.exit(1);
  }
  const schema = fs.readFileSync(sqlPath, "utf8");
  if (!schema.trim()) {
    console.error("Schema file is empty");
    process.exit(1);
  }

  const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 1433),
    options: {
      encrypt: process.env.DB_ENCRYPT ? process.env.DB_ENCRYPT !== "false" : true,
      trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    },
  };

  const pool = await sql.connect(dbConfig);

  try {
    const batches = schema
      .split(/^[ \t]*GO[ \t]*$/gim)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of batches) {
      await pool.request().batch(statement);
    }
    console.log("✅ Database schema applied successfully");
  } finally {
    await pool.close();
  }
})().catch((err) => {
  console.error("❌ Failed to apply schema:", err.message || err);
  process.exit(1);
});
