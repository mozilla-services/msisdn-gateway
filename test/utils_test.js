/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var expect = require("chai").expect;
var sinon = require("sinon");
var hmac = require("../msisdn-gateway/hmac");
var crypto = require("../msisdn-gateway/utils").crypto;
var digitsCode = require("../msisdn-gateway/utils").digitsCode;
var validateJWCryptoKey = require("../msisdn-gateway/utils")
  .validateJWCryptoKey;

describe("Utils", function() {
  describe("#digitsCode", function () {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
      sandbox.restore();
    });

    it("should return a code of X digits", function() {
      var code, s = 10;
      while(s > 0) {
        code = digitsCode(s);
        expect(code).to.have.length(s);
        if (isNaN(parseInt(code, 10))) {
          throw new Error(code + " should be made of digits.");
        }
        s--;
      }
    });

    it("should return a code of X digits even if it starts with zeros.",
      function() {
        sandbox.stub(crypto, "randomBytes", function() {
          return new Buffer("7b", "hex");
        });
        var code = digitsCode(6);
        expect(code).to.equal("000123");  // 0x7b === 123
    });
  });

  describe("#validateJWCryptoKey", function () {
    describe("Empty", function() {
        expect(function() {
          validateJWCryptoKey("");
        }).to.throw(/node bin\/generate-keypair/);
    });

    describe("RS algorithm", function() {
      it("should validate n parameter", function() {
        var key = {algorithm: "RS", e: "e"};
        expect(function() {
          validateJWCryptoKey(key);
        }).to.throw(/missing n parameter/);
      });

      it("should validate e parameter", function() {
        var key = {algorithm: "RS", n: "n"};
        expect(function() {
          validateJWCryptoKey(key);
        }).to.throw(/missing e parameter/);
      });
    });

    describe("DS algorithm", function() {
      it("should validate y parameter", function() {
        var key = {algorithm: "DS"};
        expect(function() {
          validateJWCryptoKey(key);
        }).to.throw(/missing y parameter/);
      });

      it("should validate p parameter", function() {
        var key = {algorithm: "DS", y: "y"};
        expect(function() {
          validateJWCryptoKey(key);
        }).to.throw(/missing p parameter/);
      });

      it("should validate q parameter", function() {
        var key = {algorithm: "DS", y: "y", p: "p"};
        expect(function() {
          validateJWCryptoKey(key);
        }).to.throw(/missing q parameter/);
      });

      it("should validate g parameter", function() {
        var key = {algorithm: "DS", y: "y", p: "p", q: "q"};
        expect(function() {
          validateJWCryptoKey(key);
        }).to.throw(/missing g parameter/);
      });
    });
  });

  describe("#hmac", function() {
    it("should throw if secret is missing", function() {
        expect(function() {
          hmac("test", undefined);
        }).to.throw(/You should provide a secret./);
    });

    it("should allow a algorithm parameter.", function() {
      var result = hmac("test", crypto.randomBytes(16).toString("hex"),
                        "sha512");
      expect(result).to.length(128);
    });
  });
});
