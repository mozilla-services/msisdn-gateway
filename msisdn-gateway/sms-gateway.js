/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var Leonix = require("./sms/leonix");

var providers = {
  "+33": Leonix
};

function sendSMS(msisdn, message, callback) {
  var areaCode = msisdn.substr(0, 3);
  if (providers.hasOwnProperty(areaCode)) {
    var provider = new providers[areaCode]();
    provider.sendSms(msisdn, message, callback);
    return;
  }
  console.log(msisdn, message);
  callback(null, {mtNumber: "123"});
}

module.exports = {
  sendSMS: sendSMS
};
