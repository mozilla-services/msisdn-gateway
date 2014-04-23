/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var conf = require("./config").conf;
var hmac = require("./hmac");
var phone = require("phone");

function validateMSISDN(req, res, next) {
  req.msisdn = phone(req.body.msisdn);

  if (req.msisdn === null) {
    res.sendError("body", "msisdn", "Invalid MSISDN number.");
    return;
  }
  req.msisdnId = hmac(req.msisdn, conf.get("msisdnIdSecret"));

  next();
}

module.exports = {
  validateMSISDN: validateMSISDN
};
