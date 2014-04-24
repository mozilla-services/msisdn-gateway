/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var request = require("request");
var querystring = require("querystring");


function Leonix() {
  this._conf = conf.get("leonixCredentials");
  if (!this._conf) {
    throw new Error("You should configure Leonix credentials first.");
  }
}


Leonix.prototype = {
  sendSms: function sendSms(msisdn, message, callback) {
    var source = this._conf.source;
    var url = this._conf.endpoint + "?" + querystring.stringify({
      service: this._conf.service,
      login: this._conf.login,
      pwd: this._conf.pwd,
      source: source,
      number: msisdn.replace("+33", "0"),
      msg: message
    });
    request.get(url, function(err) {
      callback(err, {mtNumber: source});
    });
  }
};

module.exports = Leonix;
