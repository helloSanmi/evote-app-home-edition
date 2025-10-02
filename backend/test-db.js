require("dotenv").config();
const { q } = require("./db");

(async () => {
  try {
    const [rows] = await q("SELECT 1 AS value");
    console.log("DB Connected! Test query result:", rows);
    process.exit(0);
  } catch (err) {
    console.error("DB Connection Error:", err);
    process.exit(1);
  }
})();
