/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var expect = require("chai").expect;
var sinon = require("sinon");
var request = require("request");
var proxyquire = require('proxyquire');

describe("SMS Gateway", function() {
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


      sendSMS("+33123456789", "Body", function(err) {
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


      sendSMS("+33123456789", "Body", function(err) {
        expect(numberOfTries).to.eql(3);
        done();
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
      gateway.sendSms("123456789", "Body", function(err, res) {
        expect(requests).to.length(1);
        expect(requests[0]).to.match(/^http:\/\/nexmo/);
        expect(requests[0]).to.match(/api_key=123/);
        expect(requests[0]).to.match(/api_secret=456/);
        expect(requests[0]).to.match(/from=Mozilla%40/);
        expect(requests[0]).to.match(/text=Body/);
        expect(requests[0]).to.match(/to=123456789/);
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
      gateway.sendSms("123456789", "Body", function(err, res) {
        expect(requests).to.length(1);
        expect(requests[0].url).to.match(/^http:\/\/beepsend/);
        expect(requests[0].url).to.match(/123$/);
        expect(requests[0].headers.Authorization).to.match(/Token 456/);
        expect(requests[0].form).to.eql({
          to: "123456789",
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
      gateway.sendSms("+33123456789", "Body", function(err, res) {
        expect(requests).to.length(1);
        expect(requests[0]).to.match(/^http:\/\/leonix/);
        expect(requests[0]).to.match(/service=20629/);
        expect(requests[0]).to.match(/login=123/);
        expect(requests[0]).to.match(/pwd=456/);
        expect(requests[0]).to.match(/source=Mozilla%40/);
        expect(requests[0]).to.match(/number=0123456789/);
        expect(requests[0]).to.match(/msg=Body/);
        done();
      });
    });
  });
});
