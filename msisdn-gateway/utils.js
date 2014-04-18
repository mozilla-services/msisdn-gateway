/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Returns a random integer between min and max
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Build a digits code
 */
function digitsCode(size) {
  var s = size;
  var code = "";
  while (s > 0) {
    s--;
    code += getRandomInt(0, 9);
  }
  return code;
}

module.exports = {
  digitsCode: digitsCode
};
