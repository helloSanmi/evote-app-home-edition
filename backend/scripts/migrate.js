#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

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
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    multipleStatements: true,
    timezone: "Z",
  };

  const conn = await mysql.createConnection(dbConfig);

  try {
    const cleaned = schema
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, "").trim())
      .filter(Boolean)
      .join("\n");

    const statements = cleaned
      .split(/;\s*(?:\r?\n|$)/g)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await conn.query(statement);
    }
    console.log("✅ Database schema applied successfully");
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error("❌ Failed to apply schema:", err.message || err);
  process.exit(1);
});
