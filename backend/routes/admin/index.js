const express = require("express");

const router = express.Router();

require("./candidates")(router);
require("./sessions")(router);
require("./users")(router);
require("./profileChanges")(router);
require("./analytics")(router);
require("./logs")(router);
require("./files")(router);
require("./verification")(router);

module.exports = router;
