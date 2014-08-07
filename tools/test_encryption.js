#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var encrypt = require("../msisdn-gateway/encrypt");
// var digitsCode = require("../msisdn-gateway/utils").digitsCode;

var HawkId = "c27f3318d9df06fec997f6fbad54893789547cc28327789d5a83a26bd80b4206";
var MSISDN = "+33508866481";

var counter = 0;

while (true) {
  // Uncomment to activate random values.
  // MSISDN = "+33" + digitsCode(9);
  var cipher = encrypt.encrypt(HawkId, MSISDN);
  counter++;

  // If you want to count the number of reencrypt, please add 
  // a console.log("Reencrypt") in the encrypt.decrypt#try.catch block.
  // Else you will just make sure that we can encrypt correctly.
  encrypt.decrypt(HawkId, cipher);
  process.stdout.write("\r" + MSISDN + "\t" + counter + " ");
}
