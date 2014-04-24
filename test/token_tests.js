/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var expect = require("chai").expect;
var crypto = require("crypto");
var Token = require("../msisdn-gateway/token").Token;

describe("Token", function() {
  describe("#constructor", function() {
    it("should generate a new sessionToken if not provide.", function() {
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
        expect(token.tokenId).to.length(64);
        expect(token.tokenId).to.eql(tokenId);

        expect(token.authKey).to.length(64);
        expect(token.authKey).to.eql(tokenAuthKey);

        expect(token.sessionToken).to.length(64);
        expect(token.sessionToken).to.eql(tokenSessionToken);
        expect(sessionToken).to.eql(tokenSessionToken);
        done();
      });
    });
  });
});
