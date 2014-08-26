/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var request = require("request");


function BeepSend(options) {
  this._conf = options;
  if (this._conf.apiToken === "") {
    throw new Error("You should configure BeepSend credentials first.");
  }
}


BeepSend.prototype = {
  sendSms: function sendSms(from, to, message, callback) {
    request.post({
      url: this._conf.endpoint + "/" + this._conf.connectionId,
      headers: {
        "Authorization": "Token " + this._conf.apiToken
      },
      form: {
        to: to,
        message: message,
        from: from.replace(/@$/g, "")
      }
    }, function(err, resp) {
      callback(err, resp.body);
    });
  }
};

module.exports = BeepSend;
