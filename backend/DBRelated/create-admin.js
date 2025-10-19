require("dotenv").config();
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT || 3306),
      timezone: "Z",
    });

    const plainPassword = "admin000"; // change if needed
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const [result] = await conn.execute(
      `INSERT INTO Users (fullName, username, email, password, hasVoted, isAdmin, role, chatStatus)
       VALUES (?,?,?,?,0,1,'admin','offline')
       ON DUPLICATE KEY UPDATE password=VALUES(password), role='admin', isAdmin=1, chatStatus='offline'`,
      ["Vote Admin", "voteadm", "admin@techanalytics.org", hashedPassword]
    );

    const newId = result.insertId || null;
    console.log(`✅ Admin ensured with ID: ${newId || "existing"}`);
    console.log(`   Username: voteadm`);
    console.log(`   Password: ${plainPassword}`);

    await conn.end();
  } catch (err) {
    console.error("❌ Error creating admin:", err.message);
    process.exit(1);
  }
})();
