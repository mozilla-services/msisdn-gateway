/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var request = require("request");
var querystring = require("querystring");


function Nexmo(options) {
  this._conf = options;
  if (!this._conf.endpoint === '') {
    throw new Error("You should configure Nexmo credentials first.");
  }
}


Nexmo.prototype = {
  sendSms: function sendSms(msisdn, message, callback) {
    var url = this._conf.endpoint + "?" + querystring.stringify({
      api_key: this._conf.apiKey,
      api_secret: this._conf.apiSecret,
      from: conf.get("mtSender"),
      to: msisdn.replace("+", ""),
      text: message
    });
    request.get(url, function(err) {
      callback(err);
    });
  }
};

module.exports = Nexmo;
