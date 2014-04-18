/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var expect = require("chai").expect;
var digitsCode = require("../msisdn-gateway/utils").digitsCode;

describe("Utils", function() {
  describe("#digitsCode", function () {
    it("should return a code of X digits", function() {
      var code, s = 10;
      while(s > 0) {
        s--;
        code = digitsCode(s);
        expect(code).to.have.length(s);
        if (isNaN(parseInt(code, 10))) {
          throw new Error(code + " should be made of digits.");
        }
      }
    });
  });
});
