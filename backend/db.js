// db.js

const mysql = require("mysql2/promise");

const config = {
  host: process.env.SQL_SERVER,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  port: parseInt(process.env.SQL_PORT),
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
