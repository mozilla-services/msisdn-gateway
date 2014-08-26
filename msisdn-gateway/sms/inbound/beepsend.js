/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var phone = require("phone");


module.exports = function paramsFromRequest(params) {
  if (!params.hasOwnProperty("from")) {
    return null;
  }
  var options = {
    msisdn: '+' + params.from,
    text: params.message  || ""
  };

  // Handle req.body.mccmnc
  if (params.hasOwnProperty("mccmnc")) {
    options.mcc = params.mccmnc.mcc;
    options.mnc = params.mccmnc.mnc;

  // Handle req.query.mcc and req.query.mnc
  } else if (params.hasOwnProperty("mcc")) {
    options.mcc = params.mcc;
    options.mnc = params.mnc;

  // Guess the MCC from the MSISDN
  } else {
    var makePhone = phone(options.msisdn, "mcc");
    if (makePhone.length === 2) {
      options.mcc = makePhone[1];
    }
  }

  return options;
};
