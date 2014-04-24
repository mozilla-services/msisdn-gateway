/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var Leonix = require("./sms/leonix");
var Nexmo = require("./sms/nexmo");

var providers = {
  "+33": Leonix
};

function sendSMS(msisdn, message, callback) {
  var areaCode = msisdn.substr(0, 3), provider;
  if (providers.hasOwnProperty(areaCode)) {
    provider = new providers[areaCode]();
  } else {
    provider = new Nexmo();
  }
  console.log(msisdn, message);
  provider.sendSms(msisdn, message, callback);
}

module.exports = {
  sendSMS: sendSMS
};
