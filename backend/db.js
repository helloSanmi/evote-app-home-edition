// db.js

const mysql = require("mysql2/promise");

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool;

const getDbPool = async () => {
  if (!pool) {
    pool = mysql.createPool(config);
  }
  return pool;
};

module.exports = { getDbPool };