/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * Dummy encrypt that return the same value.
 */
function encrypt(hawkId, msisdn) {
  return msisdn;
}

/**
 * Dummy decrypt that returns the same value.
 */
function decrypt(hawkId, encryptedString) {
  return encryptedString;
}

module.exports = {
  encrypt: encrypt,
  decrypt: decrypt
};
