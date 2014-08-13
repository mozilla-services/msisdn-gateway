/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var request = require("request");
var querystring = require("querystring");


function Leonix(options) {
  this._conf = options;
  if (this._conf.service === "") {
    throw new Error("You should configure Leonix credentials first.");
  }
}


Leonix.prototype = {
  sendSms: function sendSms(from, to, message, callback) {
    var url = this._conf.endpoint + "?" + querystring.stringify({
      service: this._conf.service,
      login: this._conf.login,
      pwd: this._conf.pwd,
      source: from,
      number: to.replace("+33", "0"),
      msg: message
    });
    request.get(url, function(err, resp) {
      callback(err, resp.content);
    });
  }
};

module.exports = Leonix;
