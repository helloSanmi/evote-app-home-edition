require("dotenv").config();
const bcrypt = require("bcryptjs");
const sql = require("mssql");

(async () => {
  try {
    // 1. Connect to DB
    const pool = await sql.connect({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT || 1433),
      options: {
        encrypt: process.env.DB_ENCRYPT ? process.env.DB_ENCRYPT !== "false" : true,
        trustServerCertificate: process.env.DB_TRUST_CERT === "true",
      },
    });

    const plainPassword = "admin000"; // change if needed
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const request = pool.request();
    request.input("fullName", "Vote Admin");
    request.input("username", "voteadm");
    request.input("email", "admin@techanalytics.org");
    request.input("password", hashedPassword);

    const result = await request.query(
      `INSERT INTO Users (fullName, username, email, password, hasVoted, isAdmin)
       OUTPUT INSERTED.id
       VALUES (@fullName, @username, @email, @password, 0, 1)`
    );

    const newId = result.recordset?.[0]?.id;
    console.log(`✅ Admin created with ID: ${newId}`);
    console.log(`   Username: voteadm`);
    console.log(`   Password: ${plainPassword}`);

    await pool.close();
  } catch (err) {
    console.error("❌ Error creating admin:", err.message);
    process.exit(1);
  }
})();
