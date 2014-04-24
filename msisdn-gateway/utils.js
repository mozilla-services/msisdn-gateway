/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var crypto = require("crypto");

/**
 * Build a digits code
 */
function digitsCode(size) {
  var nbBytes = Math.ceil(size / 2);
  var code = parseInt(crypto.randomBytes(nbBytes)
    .toString("hex"), 16).toString().substr(0, size);
  // If the code starts with zeros, parseInt removed them so we have
  // to put them back.
  while (code.length < size) code = "0" + code;
  return code;
}

/**
 * Validate JWCrypto Keys
 */
function validateJWCryptoKey(keyObj) {
  if (keyObj === "") {
    throw new Error("Please generate new JWCrypto keypair using: " +
                    "node bin/generate-keypair");
  }
  if (keyObj.algorithm === 'RS') {
    if (!keyObj.n) {
      throw new Error("missing n parameter.");
    }
    if (!keyObj.e) {
      throw new Error("missing e parameter.");
    }
  }
  else { // DS
    if (!keyObj.y) {
      throw new Error("missing y parameter.");
    }
    if (!keyObj.p) {
      throw new Error("missing p parameter.");
    }
    if (!keyObj.q) {
      throw new Error("missing q parameter.");
    }
    if (!keyObj.g) {
      throw new Error("missing g parameter.");
    }
  }
  return keyObj;
}

module.exports = {
  crypto: crypto,
  digitsCode: digitsCode,
  validateJWCryptoKey: validateJWCryptoKey
};
