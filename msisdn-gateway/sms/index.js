/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("../config").conf;
var smsGatewaysConf = conf.get("smsGateways");

var smsMapping = conf.get("smsMapping");
var MappingEngine = require("./infos/" + smsMapping.engine);

var providers;

/**
 * Order provider by priority and load them.
 **/
function buildSmsGateway() {
  providers = [];
  Object
    .keys(smsGatewaysConf)
    .map(function (gateway) {
      return [gateway, smsGatewaysConf[gateway].priority || 0];
    })
    .sort(function (a, b) {
      if (a[1] < b[1]) return 1;
      if (a[1] >= b[1]) return -1;
      return 0;
    })
    .forEach(function (d) {
      var Gateway = require("./outbound/" + d[0]);
      try {
        providers.push(new Gateway(smsGatewaysConf[d[0]]));
      } catch (err) {}
    });

  // Refresh the priority order every hour.
  setTimeout(buildSmsGateway, conf.get("smsGatewayResetTimer") * 1000);
}
buildSmsGateway();


function sendSMS(mtSender, msisdn, message, callback, retries) {
  if (retries === undefined) {
    retries = conf.get("nbSmsSendTries");
  }
  var provider = providers[0];
  provider.sendSms(mtSender, msisdn, message, function(err, data) {
    if (err) {
      // In case of error, try the next provider.
      if (providers.length > 1) {
        providers.push(providers.shift());
      }
      if (retries > 1) {
        sendSMS(mtSender, msisdn, message, callback, --retries);
      } else {
        callback(err, data);
      }
      return;
    }
    callback(null, data);
  });
}

module.exports.sendSMS = sendSMS;
module.exports.numberMap = new MappingEngine(smsMapping);
