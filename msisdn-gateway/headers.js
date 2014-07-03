/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var conf = require("./config").conf;

module.exports = function headersMiddleware(req, res, next) {
  /* Make sure we don't decorate the writeHead more than one time. */
  if (res._headersMiddleware) {
    next();
    return;
  }

  var writeHead = res.writeHead;
  res._headersMiddleware = true;
  res.writeHead = function headersWriteHead() {
    if (res.statusCode === 200 || res.statusCode === 401) {
      res.setHeader('Timestamp', Date.now());
    }

    if (res.statusCode === 503 || res.statusCode === 429) {
      res.setHeader('Retry-After', conf.get('retryAfter'));
    }
    writeHead.apply(res, arguments);
  };
  next();
};
