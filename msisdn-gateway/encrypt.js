/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var sodium = require("sodium");

/**
 * Take an hawkId and an encrypted string and decrypt them
 */
function decrypt(hawkId, encryptedString) {
  // Handle null
  if (encryptedString === null) {
    return null;
  }

  var encrypted = JSON.parse(encryptedString);
  var data = {};
  data.cipherText = new Buffer(encrypted.cipherText, "base64");
  data.nonce = new Buffer(encrypted.nonce, "base64");
  var box = new sodium.SecretBox(hawkId);
  return box.decrypt(data, "utf8");
}


/**
 * Take an hawkId and a MSISDN and encrypt them as a string
 */
function encrypt(hawkId, msisdn) {
  // Handle null
  if (msisdn === null) {
    return null;
  }
  var box = new sodium.SecretBox(hawkId);
  var encrypted = box.encrypt(msisdn, "utf8");
  var data = {
    cipherText: encrypted.cipherText.toString("base64"),
    nonce: encrypted.nonce.toString("base64")
  };
  try {
    var jsonCipher = JSON.stringify(data);
    decrypt(hawkId, jsonCipher);
    return jsonCipher;
  } catch (err) {
    // In case decrypt fails we reencrypt with another nonce
    return encrypt(hawkId, msisdn);
  }
}

module.exports = {
  encrypt: encrypt,
  decrypt: decrypt
};
