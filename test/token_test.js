/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var expect = require("chai").expect;
var crypto = require("crypto");
var Token = require("../msisdn-gateway/token").Token;

describe("Token", function() {
  "use strict";

  describe("#constructor", function() {
    it("should generate a new sessionToken if not provided.", function() {
      var token = new Token();
      expect(token.hasOwnProperty("sessionToken")).to.equal(true);
      expect(token.sessionToken).to.length(64);
    });

    it("should allow to pass the sessionToken parameter.", function() {
      var sessionToken = crypto.randomBytes(32).toString("hex");
      var token = new Token(sessionToken);
      expect(token.hasOwnProperty("sessionToken")).to.equal(true);
      expect(token.sessionToken).to.eql(sessionToken);
    });
  });

  describe("#getCredentials", function() {
    it("should return the credentials", function(done) {
      var sessionToken = crypto.randomBytes(32).toString("hex");
      var token = new Token(sessionToken);
      token.getCredentials(function(tokenId, tokenAuthKey, tokenSessionToken) {
        expect(tokenId).to.length(64);
        expect(tokenAuthKey).to.length(64);
        expect(tokenSessionToken).to.length(64);
        expect(sessionToken).to.eql(tokenSessionToken);
        done();
      });
    });
  });
});
