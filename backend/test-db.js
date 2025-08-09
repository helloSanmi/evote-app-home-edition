require("dotenv").config();
const { getDbPool } = require("./db");

(async () => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query("SELECT 1");
    console.log("DB Connected! Test query result:", rows);
    process.exit(0);
  } catch (err) {
    console.error("DB Connection Error:", err);
    process.exit(1);
  }
})();
