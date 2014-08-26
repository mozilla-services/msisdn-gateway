/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var expect = require("chai").expect;
var sinon = require("sinon");
var request = require("request");
var proxyquire = require('proxyquire');
var conf = require("../msisdn-gateway").conf;

var smsGateway = require("../msisdn-gateway/sms");
var FileMap = require("../msisdn-gateway/sms/infos/file");

describe("SMS Gateway", function() {
  "use strict";

  var sandbox, requests, Gateway, requestGetStub, requestPostStub;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    requests = [];
    requestPostStub = sandbox.stub(request, "post",
      function(options, cb) {
        requests.push(options);
        cb(null, {
          body: '{"messages": [{"status":"0"}]}',
          statusCode: 200
        });
      });
    requestGetStub = sandbox.stub(request, "get",
      function(options, cb) {
        requests.push(options);
        cb(null, {
          body: '{"messages": [{"status":"0"}]}',
          statusCode: 200
        });
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

      var sendSMS = proxyquire("../msisdn-gateway/sms", {
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
          cb(new Error("Service Unavailable."), {
            body: '{"messages": [{"status":"0"}]}',
            statusCode: 503
          });
        });

      requestPostStub = sandbox.stub(request, "post",
        function(options, cb) {
          numberOfTries++;
          cb(new Error("Service Unavailable."), {
            body: '{"messages": [{"status":"0"}]}',
            statusCode: 503
          });
        });

      var sendSMS = proxyquire("../msisdn-gateway/sms", {
        request: {
          get: requestGetStub,
          post: requestPostStub
        }
      }).sendSMS;


      sendSMS("Mozilla@", "+33623456789", "Body", function() {
        expect(numberOfTries).to.eql(3);
        done();
      });
    });

  describe("#getMoVerifierFor", function() {
    var previousMapping, mapping;

    beforeEach(function() {
      previousMapping = conf.get("smsMapping");
      mapping = conf.get("smsMapping");
    });

    afterEach(function() {
      conf.set("smsMapping", previousMapping);
    });

    it("should return the (MCC, MNC) specific number.", function() {
      mapping.moVerifierMapping["208110"] = "1234";
      conf.set("smsMapping", mapping);
      smsGateway.numberMap = new FileMap(mapping);
      smsGateway.numberMap.getMoVerifierFor(208, 110, function(err, number) {
        if (err) throw err;
        expect(number).to.eql("1234");
      });
    });

    it("should return the (MCC, _) specific number.", function() {
      mapping.moVerifierMapping["208"] = "1234";
      conf.set("smsMapping", mapping);
      smsGateway.numberMap = new FileMap(mapping);
      smsGateway.numberMap.getMoVerifierFor(208, 111, function(err, number) {
        if (err) throw err;
        expect(number).to.eql("1234");
      });
    });

    it("should return the default number.", function() {
      smsGateway.numberMap.getMoVerifierFor(514, 111, function(err, number) {
        if (err) throw err;
        expect(number).to.eql("456");
      });
    });

    it("should return null if no default number.", function() {
      mapping.moVerifier = "";
      conf.set("smsMapping", mapping);
      smsGateway.numberMap = new FileMap(mapping);
      smsGateway.numberMap.getMoVerifierFor(514, 111, function(err, number) {
        if (err) throw err;
        expect(number).to.eql(null);
      });
    });
  });

  describe("#getMtSenderFor", function() {
    var previousMapping, mapping;

    beforeEach(function() {
      previousMapping = conf.get("smsMapping");
      mapping = conf.get("smsMapping");
    });

    afterEach(function() {
      conf.set("smsMapping", previousMapping);
    });

    it("should return the (MCC, MNC) specific number.", function() {
      mapping.mtSenderMapping["21407"] = "1234";
      conf.set("smsMapping", mapping);
      smsGateway.numberMap = new FileMap(mapping);
      smsGateway.numberMap.getMtSenderFor("214", "07", function(err, number) {
        if (err) throw err;
        expect(number).to.eql("1234");
      });
    });

    it("should return the (MCC, _) specific number.", function() {
      mapping.mtSenderMapping["208"] = "1234";
      conf.set("smsMapping", mapping);
      smsGateway.numberMap = new FileMap(mapping);
      smsGateway.numberMap.getMtSenderFor(208, 111, function(err, number) {
        if (err) throw err;
        expect(number).to.eql("1234");
      });
    });

    it("should return the (MCC, _) specific number if MNC not provided.",
      function() {
        mapping.mtSenderMapping["208"] = "1234";
        conf.set("smsMapping", mapping);
        smsGateway.numberMap = new FileMap(mapping);
        smsGateway.numberMap.getMtSenderFor(208, undefined,
          function(err, number) {
            if (err) throw err;
            expect(number).to.eql("1234");
          });
      });

    it("should return the default number.", function() {
      smsGateway.numberMap.getMtSenderFor(514, 111, function(err, number) {
        if (err) throw err;
        expect(number).to.eql("Mozilla@");
      });
    });

    it("should return the default number.", function() {
      smsGateway.numberMap.getMtSenderFor(undefined, undefined,
        function(err, number) {
          if (err) throw err;
          expect(number).to.eql("Mozilla@");
        });
    });
  });

  describe("Nexmo", function() {
    beforeEach(function() {
      Gateway = proxyquire("../msisdn-gateway/sms/outbound/nexmo", {
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
      Gateway = proxyquire("../msisdn-gateway/sms/outbound/beepsend", {
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
      Gateway = proxyquire("../msisdn-gateway/sms/outbound/leonix", {
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
