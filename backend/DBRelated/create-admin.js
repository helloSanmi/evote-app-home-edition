require("dotenv").config();
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  try {
    // 1. Connect to DB
    const pool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT),
    });

    // 2. Hash the password
    const plainPassword = "admin000"; // change if needed
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // 3. Insert the admin user
    const [result] = await pool.query(
      `INSERT INTO Users (fullName, username, email, password, hasVoted)
       VALUES (?, ?, ?, ?, 0)`,
      ["Vote Admin", "voteadm", "admin@techanalytics.org", hashedPassword]
    );

    console.log(`✅ Admin created with ID: ${result.insertId}`);
    console.log(`   Username: voteadm`);
    console.log(`   Password: ${plainPassword}`);

    await pool.end();
  } catch (err) {
    console.error("❌ Error creating admin:", err.message);
    process.exit(1);
  }
})();
