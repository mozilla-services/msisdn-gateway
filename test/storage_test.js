/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var expect = require("chai").expect;
var getStorage = require("../msisdn-gateway/storage");
var conf = require("../msisdn-gateway").conf;
var hmac = require("../msisdn-gateway/hmac");

var msisdn = "0123456489";
var msisdnMac = hmac(msisdn, conf.get("msisdnMacSecret"));
var code = "123456";

describe("Storage", function() {
  function testStorage(name, createStorage) {
    var storage;

    describe(name, function() {
      beforeEach(function() {
        storage = createStorage();
      });
  
      afterEach(function(done) {
        storage.drop(function(err) {
          // Remove the storage reference so tests blow up in an explicit way.
          storage = undefined;
          done(err);
        });
      });

      describe("#setCode", function() {
        it("should store the code.", function(done) {
          storage.setCode(msisdnMac, code,
            function(err) {
              if (err)  {
                throw err;
              }
              storage.verifyCode(msisdnMac, code, function(err, value){
                expect(value).to.equal(true);
                done();
              });
            });
        });
      });

      describe("#verifyCode", function() {
        it("should return false on invalid code.", function(done) {
          storage.setCode(msisdnMac, code,
            function(err) {
              if (err)  {
                throw err;
              }
              storage.verifyCode(msisdnMac, "wrong-code", function(err, value){
                expect(value).to.equal(false);
                done();
              });
            });
        });

        it("should return null on invalid msisdn.", function(done) {
          storage.setCode(msisdnMac, code,
            function(err) {
              if (err)  {
                throw err;
              }
              storage.verifyCode("wrong-mac", code, function(err, value){
                expect(value).to.equal(null);
                done();
              });
            });
        });

      });

      describe("#ping", function() {
        it("should return true if we are connected", function(done) {
          storage.ping(function(connected) {
            expect(connected).to.eql(true);
            done();
          });
        });
      });
    });
  }

  // Test all the storages implementation.
  testStorage("Default", function createDefaultStorage(options) {
    return getStorage({}, options);
  });

  testStorage("Redis", function createRedisStorage(options) {
    return getStorage({engine: "redis", settings: {"db": 5}}, options);
  });
});
