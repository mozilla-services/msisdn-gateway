/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var phone = require("phone");


module.exports = function paramsFromRequest(params) {
  if (!params.hasOwnProperty("msisdn")) {
    return null;
  }
  var options = {
    msisdn: '+' + params.msisdn,
    text: params.text || ""
  };

  // Get the MCC/MNC from the network-code parameter
  if (params.hasOwnProperty("network-code")) {
    options.mcc = params["network-code"].slice(0, 3);
    options.mnc = params["network-code"].slice(3, 6);

  // Guess the MCC from the MSISDN
  } else {
    var makePhone = phone(options.msisdn, "mcc");
    if (makePhone.length === 2) {
      options.mcc = makePhone[1];
    }
  }
  return options;
};
