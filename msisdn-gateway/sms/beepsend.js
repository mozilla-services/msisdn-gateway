/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var request = require("request");


function BeepSend(options) {
  this._conf = options;
  if (this._conf.apiToken === "") {
    throw new Error("You should configure BeepSend credentials first.");
  }
}


BeepSend.prototype = {
  sendSms: function sendSms(msisdn, message, callback) {
    request.post({
      url: this._conf.endpoint + "/" + this._conf.connectionId,
      headers: {
        "Authorization": "Token " + this._conf.apiToken
      },
      form: {
        to: msisdn,
        message: message,
        from: conf.get("mtSender").replace(/@$/g, "")
      }
    }, function(err) {
      callback(err);
    });
  }
};

module.exports = BeepSend;
