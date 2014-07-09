/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var request = require("request");


function BeepSend() {
  this._conf = conf.get("beepSendCredentials");
  if (this._conf.api_token === "") {
    throw new Error("You should configure BeepSend credentials first.");
  }
}


BeepSend.prototype = {
  sendSms: function sendSms(msisdn, message, callback) {
    var options = {
      url: this._conf.endpoint + "/" + this._conf.connection_id,
      headers: {
        "Authorization": "Token " + this._conf.api_token
      },
      form: {
        to: msisdn,
        message: message,
        from: conf.get("mtSender").replace(/@$/g, "");
      }
    };
    request.post(options, function(err) {
      callback(err);
    });
  }
};

module.exports = BeepSend;
