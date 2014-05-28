/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var request = require("request");
var querystring = require("querystring");


function Nexmo() {
  this._conf = conf.get("nexmoCredentials");
  if (!this._conf) {
    throw new Error("You should configure Nexmo credentials first.");
  }
}


Nexmo.prototype = {
  sendSms: function sendSms(msisdn, message, callback) {
    var from = this._conf.from;
    var url = this._conf.endpoint + "?" + querystring.stringify({
      api_key: this._conf.api_key,
      api_secret: this._conf.api_secret,
      from: from,
      to: msisdn.replace("+", ""),
      text: message
    });
    request.get(url, function(err) {
      callback(err);
    });
  }
};

module.exports = Nexmo;
