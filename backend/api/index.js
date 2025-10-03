let cachedHandler;

module.exports = async (req, res) => {
  try {
    if (!cachedHandler) {
      // Lazy-load to catch and report init errors
      const serverless = require("serverless-http");
      const app = require("../server"); // <- if this throws, we’ll see it below
      cachedHandler = serverless(app);
    }
    return cachedHandler(req, res);
  } catch (err) {
    // Surface the actual cause (missing env, module error, fs write, etc.)
    console.error("SERVERLESS_INIT_ERROR:", err?.stack || err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "init_failed", detail: String(err?.message || err) }));
  }
};
