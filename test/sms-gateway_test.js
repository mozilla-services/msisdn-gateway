/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var expect = require("chai").expect;
var sinon = require("sinon");
var request = require("request");
var proxyquire = require('proxyquire');
var conf = require("../msisdn-gateway").conf;

var getMoVerifier = require("../msisdn-gateway/sms-gateway").getMoVerifierFor;
var getMtSender = require("../msisdn-gateway/sms-gateway").getMtSenderFor;

describe("SMS Gateway", function() {
  "use strict";

  var sandbox, requests, Gateway, requestGetStub, requestPostStub;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    requests = [];
    requestPostStub = sandbox.stub(request, "post",
      function(options, cb) {
        requests.push(options);
        cb(null, {statusCode: 200});
      });
    requestGetStub = sandbox.stub(request, "get",
      function(options, cb) {
        requests.push(options);
        cb(null, {statusCode: 200});
      });

  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should try the next SMS Provider if the first one fails.",
    function(done) {
      requestGetStub.restore();

      // Make nexmo fails
      requestGetStub = sandbox.stub(request, "get",
        function(options, cb) {
          cb(new Error("Service Unavailable."), {statusCode: 503});
        });

      var sendSMS = proxyquire("../msisdn-gateway/sms-gateway", {
        request: {
          get: requestGetStub,
          post: requestPostStub
        }
      }).sendSMS;


      sendSMS("Mozilla@", "+33623456789", "Body", function(err) {
        if (err) throw err;
        expect(requests).to.length(1);
        expect(requests[0].url).to.match(/beepsend/);
        done(err);
      });
    });

  it("should retry 3 times and finally fail.",
    function(done) {
      var numberOfTries = 0;
      requestGetStub.restore();
      requestPostStub.restore();

      // Make both nexmo and beepsend fails
      requestGetStub = sandbox.stub(request, "get",
        function(options, cb) {
          numberOfTries++;
          cb(new Error("Service Unavailable."), {statusCode: 503});
        });

      requestPostStub = sandbox.stub(request, "post",
        function(options, cb) {
          numberOfTries++;
          cb(new Error("Service Unavailable."), {statusCode: 503});
        });

      var sendSMS = proxyquire("../msisdn-gateway/sms-gateway", {
        request: {
          get: requestGetStub,
          post: requestPostStub
        }
      }).sendSMS;


      sendSMS("Mozilla@", "+33623456789", "Body", function(err) {
        if (err) throw err;
        expect(numberOfTries).to.eql(3);
        done();
      });
    });

  describe("#getMoVerifierFor", function() {
    var previousList, previousDefault;

    beforeEach(function() {
      previousList = conf.get("moVerifierMapping");
      previousDefault = conf.get("moVerifier");
    });

    afterEach(function() {
      conf.set("moVerifierMapping", previousList);
      conf.set("moVerifier", previousDefault);
    });

    it("should return the (MCC, MNC) specific number.", function() {
      var list = conf.get("moVerifierMapping");
      list["208110"] = "1234";
      conf.set("moVerifierMapping", list);
      expect(getMoVerifier(208, 110)).to.eql("1234");
    });

    it("should return the (MCC, _) specific number.", function() {
      var list = conf.get("moVerifierMapping");
      list["208"] = "1234";
      conf.set("moVerifierMapping", list);
      expect(getMoVerifier(208, 111)).to.eql("1234");
    });

    it("should return the default number.", function() {
      expect(getMoVerifier(514, 111)).to.eql("456");
    });

    it("should return null if no default number.", function() {
      conf.set("moVerifier", "");
      expect(getMoVerifier(514, 111)).to.eql(null);
    });
  });

  describe("#getMtSenderFor", function() {
    var previousList, previousDefault;

    beforeEach(function() {
      previousList = conf.get("mtSenderMapping");
      previousDefault = conf.get("mtSender");
    });

    afterEach(function() {
      conf.set("mtSenderMapping", previousList);
      conf.set("mtSender", previousDefault);
    });

    it("should return the (MCC, MNC) specific number.", function() {
      var list = conf.get("mtSenderMapping");
      list["21407"] = "1234";
      conf.set("mtSenderMapping", list);
      expect(getMtSender("214", "07")).to.eql("1234");
    });

    it("should return the (MCC, _) specific number.", function() {
      var list = conf.get("mtSenderMapping");
      list["208"] = "1234";
      conf.set("mtSenderMapping", list);
      expect(getMtSender(208, 111)).to.eql("1234");
    });

    it("should return the (MCC, _) specific number if MNC not provided.",
      function() {
        var list = conf.get("mtSenderMapping");
        list["208"] = "1234";
        conf.set("mtSenderMapping", list);
        expect(getMtSender(208)).to.eql("1234");
      });

    it("should return the default number.", function() {
      expect(getMtSender(514, 111)).to.eql("Mozilla@");
    });

    it("should return the default number.", function() {
      expect(getMtSender()).to.eql("Mozilla@");
    });
  });

  describe("Nexmo", function() {
    beforeEach(function() {
      Gateway = proxyquire("../msisdn-gateway/sms/nexmo", {
        request: {
          get: requestGetStub,
          post: requestPostStub
        }
      });
    });

    it("should make the right API call.", function(done) {
      var gateway = new Gateway({
        endpoint: "http://nexmo",
        apiKey: "123",
        apiSecret: "456",
        priority: 10
      });
      gateway.sendSms("Mozilla@", "0623456789", "Body", function(err /*, res */) {
        if (err) throw err;
        expect(requests).to.length(1);
        expect(requests[0]).to.match(/^http:\/\/nexmo/);
        expect(requests[0]).to.match(/api_key=123/);
        expect(requests[0]).to.match(/api_secret=456/);
        expect(requests[0]).to.match(/from=Mozilla%40/);
        expect(requests[0]).to.match(/text=Body/);
        expect(requests[0]).to.match(/to=0623456789/);
        done();
      });
    });
  });

  describe("BeepSend", function() {
    beforeEach(function() {
      Gateway = proxyquire("../msisdn-gateway/sms/beepsend", {
        request: {
          get: requestGetStub,
          post: requestPostStub
        }
      });
    });

    it("should make the right API call.", function(done) {
      var gateway = new Gateway({
        endpoint: "http://beepsend",
        connectionId: "123",
        apiToken: "456",
        priority: 10
      });
      gateway.sendSms("Mozilla@", "0623456789", "Body", function(err /*, res */) {
        if (err) throw err;
        expect(requests).to.length(1);
        expect(requests[0].url).to.match(/^http:\/\/beepsend/);
        expect(requests[0].url).to.match(/123$/);
        expect(requests[0].headers.Authorization).to.match(/Token 456/);
        expect(requests[0].form).to.eql({
          to: "0623456789",
          message: "Body",
          from: "Mozilla"
        });
        done();
      });
    });
  });

  describe("Leonix", function() {
    beforeEach(function() {
      Gateway = proxyquire("../msisdn-gateway/sms/leonix", {
        request: {
          get: requestGetStub,
          post: requestPostStub
        }
      });
    });

    it("should make the right API call.", function(done) {
      var gateway = new Gateway({
        endpoint: "http://leonix",
        service: "20629",
        login: "123",
        pwd: "456",
        priority: 10
      });
      gateway.sendSms("Mozilla@", "+33623456789", "Body", function(err /*, res */) {
        if (err) throw err;
        expect(requests).to.length(1);
        expect(requests[0]).to.match(/^http:\/\/leonix/);
        expect(requests[0]).to.match(/service=20629/);
        expect(requests[0]).to.match(/login=123/);
        expect(requests[0]).to.match(/pwd=456/);
        expect(requests[0]).to.match(/source=Mozilla%40/);
        expect(requests[0]).to.match(/number=0623456789/);
        expect(requests[0]).to.match(/msg=Body/);
        done();
      });
    });
  });
});
