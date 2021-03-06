/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var request = require("request");
var querystring = require("querystring");


function Nexmo(options) {
  this._conf = options;
  if (this._conf.endpoint === '') {
    throw new Error("You should configure Nexmo credentials first.");
  }
}


Nexmo.prototype = {
  sendSms: function sendSms(from, to, message, callback) {
    var url = this._conf.endpoint + "?" + querystring.stringify({
      api_key: this._conf.apiKey,
      api_secret: this._conf.apiSecret,
      from: from.replace("+", ""),
      to: to.replace("+", ""),
      text: message
    });
    request.get(url, function(err, resp) {
      if (err) {
        callback(err, resp.body);
        return;
      }

      try {
        var content = JSON.parse(resp.body);
        if (content.messages && content.messages.length > 0 &&
            content.messages[0].status !== "0") {
          callback(
            new Error(content.messages[0].status + " — " +
                      content.messages[0]["error-text"])
          );
          return;
        }
      } catch(error) {}
      callback(err, resp.body);
    });
  }
};

module.exports = Nexmo;
