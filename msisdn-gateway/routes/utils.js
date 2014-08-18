/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var errors = require("../errno");
var sendError = require("../middleware").sendError;


function requireParams() {
  var params = Array.prototype.slice.call(arguments);
  return function(req, res, next) {
    var missingParams;

    if (!req.accepts("json")) {
      sendError(res, 406, errors.BADJSON,
                "Request body should be defined as application/json");
      return;
    }

    missingParams = params.filter(function(param) {
      return req.body[param] === undefined;
    });

    if (missingParams.length > 0) {
      sendError(res, 400, errors.MISSING_PARAMETERS,
                "Missing " + missingParams.join());
      return;
    }
    next();
  };
}

module.exports = {
  requireParams: requireParams
};
