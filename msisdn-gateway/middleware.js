/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var conf = require("./config").conf;
var hmac = require("./hmac");
var phone = require("phone");
var errors = require("./errno");


function sendError(res, code, errno, error, message, info) {
  var errmap = {};
  if (code) {
    errmap.code = code;
  }
  if (errno) {
    errmap.errno = errno;
  }
  if (error) {
    errmap.error = error;
  }
  if (message) {
    errmap.message = message;
  }
  if (info) {
    errmap.info = info;
  }

  res.json(code, errmap);
}


function validateMSISDN(req, res, next) {
  req.msisdn = phone(req.body.msisdn);

  if (req.msisdn === null) {
    sendError(res, 400, errors.INVALID_MSISDN, "Invalid MSISDN number.");
    return;
  }
  req.msisdnId = hmac(req.msisdn, conf.get("msisdnIdSecret"));

  next();
}


function checkHeaders(req, res, next) {
  if (req.body && !req.headers['content-length']) {
    sendError(res, 411, errors.LENGTH_MISSING, "No content-length");
    return;
  }
  next();
}


module.exports = {
  validateMSISDN: validateMSISDN,
  sendError: sendError,
  checkHeaders: checkHeaders
};
