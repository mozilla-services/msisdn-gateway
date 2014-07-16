/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var conf = require("./config").conf;

var smsGatewaysConf = conf.get("smsGateways");

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
      var Gateway = require("./sms/" + d[0]);
      try {
        providers.push(new Gateway(smsGatewaysConf[d[0]]));
      } catch (err) {}
    });

  // Refresh the priority order every hour.
  setTimeout(buildSmsGateway, conf.get("smsGatewayResetTimer") * 1000);
}
buildSmsGateway();


function sendSMS(msisdn, message, callback, retries) {
  if (retries === undefined) {
    retries = conf.get("nbSmsSendTries");
  }
  var provider = providers[0];
  provider.sendSms(msisdn, message, function(err) {
    if (err) {
      // In case of error, try the next provider.
      if (providers.length > 1) {
        providers.push(providers.shift());
      }
      if (retries > 1) {
        sendSMS(msisdn, message, callback, --retries);
      } else {
        callback(err);
      }
      return;
    }
    callback(null);
  });
}


/**
 * Get the moVerifier number with regards to MCC/MNC
 */
function getMoVerifierFor(mcc, mnc) {
  var moVerifierList = conf.get("moVerifierList");
  var defaultMoVerifier = conf.get("moVerifier");

  var mccMnc = mcc + "" + mnc;
  if (moVerifierList.hasOwnProperty(mccMnc)) {
    return moVerifierList[mccMnc];
  }
  if (moVerifierList.hasOwnProperty(mcc)) {
    return moVerifierList[mcc];
  }
  // If the defaultMoVerifier is not set, return null.
  if (defaultMoVerifier) {
    return defaultMoVerifier;
  }
  return null;
}


module.exports = {
  sendSMS: sendSMS,
  getMoVerifierFor: getMoVerifierFor
};
