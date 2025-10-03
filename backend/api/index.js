let cached;
module.exports = async (req, res) => {
  try {
    if (!cached) {
      const serverless = require("serverless-http");
      const app = require("../server");
      cached = serverless(app);
    }
    return cached(req, res);
  } catch (err) {
    console.error("SERVERLESS_INIT_ERROR:", err);
    res.status(500).json({ error: "init_failed", detail: String(err?.message || err) });
  }
};
