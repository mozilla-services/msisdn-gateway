/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var crypto = require("crypto");

/**
 * Build a digits code
 */
function digitsCode(size) {
  var nbBytes = Math.ceil(size/2);
  return parseInt(crypto.randomBytes(nbBytes).toString("hex"), 16)
    .toString().substr(0, size);
}

module.exports = {
  digitsCode: digitsCode
};
