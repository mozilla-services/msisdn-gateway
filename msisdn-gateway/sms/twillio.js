/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var request = require("request");


function Twillio() {
  this._conf = conf.get("twillioCredentials");
  if (!this._conf) {
    throw new Error("You should configure Twillio credentials first.");
  }
}


Twillio.prototype = {
  sendSms: function sendSms(msisdn, message, callback) {
    var url = ;
    request.get({
      url: this._conf.endpoint.replace("{AccountSid}", this._conf.accountSid),
      headers: {
        Authorization: "Basic " +
          new Buffer(this._conf.accountSid + ":" + this._conf.authToken)
              .toString("base64")
      },
      form: {
        To: "+" + msisdn,
        From: this._conf.endpoint.from,
        Body: message
      }
    }, function(err) {
      callback(err);
    });
  }
};

module.exports = Twillio;
