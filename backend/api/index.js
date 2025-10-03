const serverless = require("serverless-http");
const app = require("../server");

// Wrap Express for Vercel's Node Serverless Function runtime
module.exports = (req, res) => {
  const handler = serverless(app);
  return handler(req, res);
};
