/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var HKDF = require('hkdf');

var NAMESPACE = 'identity.mozilla.com/picl/v1/';

function KWE(name, msisdn) {
  return new Buffer(NAMESPACE + name + ':' + msisdn);
}

function KW(name) {
  return new Buffer(NAMESPACE + name);
}

function hkdf(km, info, salt, len, callback) {
  var df = new HKDF('sha256', salt, km);
  df.derive(KW(info), len, callback);
}

hkdf.KW = KW;
hkdf.KWE = KWE;

module.exports = hkdf;
