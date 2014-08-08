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

  if (req.msisdn.length !== 2) {
    sendError(res, 400, errors.INVALID_MSISDN, "Invalid MSISDN number.");
    return;
  }
  req.msisdn = req.msisdn[0];
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

function logErrors(err, req, res /*, next */) {
  req.unhandledError = err;
  var message = err.message;
  var status = err.status || 500;

  sendError(res, status, 999, message);
}


function applyErrorLogging(app) {
  function patchRoute (route) {
      route.callbacks.push(logErrors);
  }
  for (var verb in app.routes) {
      var routes = app.routes[verb];
      routes.forEach(patchRoute);
  }
}


function handle404(req, res) {
  sendError(res, 404);
}


module.exports = {
  validateMSISDN: validateMSISDN,
  sendError: sendError,
  checkHeaders: checkHeaders,
  applyErrorLogging: applyErrorLogging,
  handle404: handle404
};
