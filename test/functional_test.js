/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var expect = require("chai").expect;
var addHawk = require("superagent-hawk");
var supertest = addHawk(require("supertest"));
var sinon = require("sinon");
var app = require("../msisdn-gateway").app;
var conf = require("../msisdn-gateway").conf;
var storage = require("../msisdn-gateway").storage;
var smsGateway = require("../msisdn-gateway/sms-gateway");
var Token = require("../msisdn-gateway/token").Token;
var hmac = require("../msisdn-gateway/hmac");

var testKeyPair = require("./testKeyPair.json");


function expectFormatedError(body, location, name, description) {
  if (typeof description === "undefined") {
    description = "missing: " + name;
  }
  expect(body).eql({
    status: "errors",
    errors: [{location: location,
              name: name,
              description: description}]
  });
}

describe("HTTP API exposed by the server", function() {

  var sandbox, genuineOrigins, hawkCredentials;

  var routes = {
    '/': ['get'],
    '/discover': ['post'],
    '/register': ['post'],
    '/unregister': ['post'],
    '/sms/mt/verify': ['post'],
    '/sms/momt/nexmo_callback': ['post'],
    '/sms/verify_code': ['post']
  };

  beforeEach(function(done) {
    sandbox = sinon.sandbox.create();
    genuineOrigins = conf.get('allowedOrigins');
    conf.set('allowedOrigins', ['http://mozilla.org',
                                'http://mozilla.com']);

    // Generate Hawk credentials.
    var token = new Token();
    token.getCredentials(function(tokenId, authKey) {
      hawkCredentials = {
        id: tokenId,
        key: authKey,
        algorithm: "sha256"
      };
      var hawkHmacId = hmac(tokenId, conf.get("hawkIdSecret"));
      storage.setSession(hawkHmacId, authKey, done);
    });

  });

  afterEach(function(done) {
    sandbox.restore();
    conf.set('allowedOrigins', genuineOrigins);
    storage.drop(done);
  });

  // Test CORS is enabled in all routes for OPTIONS.
  Object.keys(routes).forEach(function(route) {
    describe("OPTIONS " + route, function() {
      it("should authorize allowed origins to do CORS", function(done) {
        supertest(app)
          .options(route)
          .set('Origin', 'http://mozilla.org')
          .expect('Access-Control-Allow-Origin', 'http://mozilla.org')
          .expect('Access-Control-Allow-Methods', 'GET,HEAD,PUT,POST,DELETE')
          .expect('Access-Control-Allow-Credentials', 'true')
          .end(done);
      });

      it("should reject unauthorized origins to do CORS", function(done) {
        supertest(app)
          .options(route)
          .set('Origin', 'http://not-authorized')
          .end(function(err, res) {
            expect(res.headers)
              .not.to.have.property('Access-Control-Allow-Origin');
            done();
          });
      });
    });
  });

  // Test CORS is enabled in all routes for GET, POST and DELETE
  Object.keys(routes).forEach(function(route) {
    routes[route].forEach(function(method) {
      describe(method + ' ' + route, function() {
        it("should authorize allowed origins to do CORS", function(done) {
          supertest(app)[method](route)
            .set('Origin', 'http://mozilla.org')
            .expect('Access-Control-Allow-Origin', 'http://mozilla.org')
            .expect('Access-Control-Allow-Credentials', 'true')
            .end(done);
        });

        it("should reject unauthorized origins to do CORS", function(done) {
          supertest(app)[method](route)
            .set('Origin', 'http://not-authorized')
            .end(function(err, res) {
              expect(res.headers)
                .not.to.have.property('Access-Control-Allow-Origin');
              done();
            });
        });
      });
    });
  });

  describe("GET /__hearbeat__", function() {

    it("should return a 503 if storage is down", function(done) {
      sandbox.stub(storage, "ping", function(callback) {
        callback(false);
      });

      supertest(app)
        .get('/__heartbeat__')
        .expect(503)
        .end(function(err, res) {
          if (err) {
            throw err;
          }
          expect(res.body).to.eql({
            'storage': false
          });
          done();
        });
    });

    it("should return a 200 if all dependencies are ok", function(done) {
      supertest(app)
        .get('/__heartbeat__')
        .expect(200)
        .end(function(err, res) {
          if (err) {
            throw err;
          }
          expect(res.body).to.eql({
            'storage': true
          });
          done();
        });
    });
  });

  describe("GET /", function() {
    it("should display project information.", function(done) {
      supertest(app)
        .get('/')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          ["name", "description", "version", "homepage", "endpoint"]
          .forEach(function(key) {
            expect(res.body).to.have.property(key);
          });
          done();
        });
    });

    it("should not display server version if displayVersion is false.",
      function(done) {
        conf.set("displayVersion", false);

        supertest(app)
          .get('/')
          .expect(200)
          .end(function(err, res) {
            expect(res.body).not.to.have.property("version");
            done();
          });
      });
  });

  describe("POST /discover", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/discover')
        .type('json')
        .expect('Content-Type', /json/);
    });

    it("should works without the MSISDN parameter", function(done) {
      jsonReq.send({}).expect(200).end(done);
    });

    it("should take only a valid MSISDN number", function(done) {
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn",
                            "Invalid MSISDN number.");
        done();
      });
    });

    it("should return the sms/mt flow if the MSISDN is configured.",
      function(done) {
        jsonReq.send({msisdn: "+33123456789"}).expect(200).end(
          function(err, res) {
            if (err) throw err;
            expect(res.body).to.eql({
              "verificationMethods": ["sms/mt", "sms/momt"],
              "verificationDetails": {
                "sms/mt": {
                  "mtSender": "Mozilla",
                  "url": "http://" + res.req._headers.host +
                    "/v1/msisdn/sms/mt/verify"
                },
                "sms/momt": {
                  "mtSender": "Mozilla",
                  "moVerifier": "456"
                }
              }
            });
            done();
          });
      });

    it("should return the sms/momt flow if the MSISDN is not configured.",
      function(done) {
        jsonReq.send({}).expect(200).end(function(err, res) {
          if (err) throw err;
          expect(res.body).to.eql({
            "verificationMethods": ["sms/momt"],
            "verificationDetails": {
              "sms/momt": {
                "mtSender": "Mozilla",
                "moVerifier": "456"
              }
            }
          });
          done();
        });
      });
  });

  describe("POST /register", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/register')
        .type('json')
        .expect('Content-Type', /json/);
    });

    it("should create the Hawk session.", function(done) {
      jsonReq.send({msisdn: "+33123456789"}).expect(200).end(
        function(err, res) {
          expect(res.body.hasOwnProperty("msisdnSessionToken")).to.equal(true);
          expect(res.body.msisdnSessionToken).to.length(64);
          done();
        });
    });
  });

  describe("POST /unregister", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/unregister')
        .hawk(hawkCredentials)
        .type('json')
        .expect('Content-Type', /json/);
    });

    it("should require the MSISDN params", function(done) {
      jsonReq.send({}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn");
        done();
      });
    });

    it("should require a valid MSISDN number", function(done) {
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(
        function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, "body", "msisdn",
                              "Invalid MSISDN number.");
          done();
        });
    });

    it("should clean the session.", function(done) {
      jsonReq.send({msisdn: "+33123456789"}).expect(200).end(
        function(err, res, tokenId) {
          if (err) {
            throw err;
          }
          storage.getSession(tokenId, function(err, result) {
            if (err) {
              throw err;
            }
            expect(result).to.equal(null);
            done();
          });
        });
    });
  });

  describe("POST /sms/mt/verify", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/sms/mt/verify')
        .hawk(hawkCredentials)
        .type('json')
        .expect('Content-Type', /json/);
    });

    it("should require a valid MSISDN number", function(done) {
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(
        function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, "body", "msisdn",
                              "Invalid MSISDN number.");
          done();
        });
    });

    it("should send a SMS with the long code by default.", function(done) {
      var message;
      sandbox.stub(smsGateway, "sendSMS",
        function(msisdn, msg, cb) {
          message = msg;
          cb(null);
        });
      jsonReq.send({msisdn: "+33123456789"}).expect(200).end(
        function(err, res) {
          sinon.assert.calledOnce(smsGateway.sendSMS);
          expect(message).to.length(32);
          done();
        });
    });

    it("should send a SMS with a short code if shortVerificationCode is true.",
      function(done) {
        var message;
        sandbox.stub(smsGateway, "sendSMS",
          function(msisdn, msg, cb) {
            message = msg;
            cb(null);
          });
        jsonReq.send({
          msisdn: "+33123456789",
          shortVerificationCode: true
        }).expect(200).end(
          function(err, res) {
            sinon.assert.calledOnce(smsGateway.sendSMS);
            var code = message.substr(message.length-6);
            expect(message).to.eql("Your verification code is: " + code);
            expect(isNaN(parseInt(code))).to.eql(false);
            done();
          });
      });

    it("should send a SMS with the long code if shortVerificationCode " +
       "is false.", function(done) {
        var message;
        sandbox.stub(smsGateway, "sendSMS",
          function(msisdn, msg, cb) {
            message = msg;
            cb(null);
          });
         jsonReq.send({
           msisdn: "+33123456789",
           shortVerificationCode: false
         }).expect(200).end(
          function(err, res) {
            sinon.assert.calledOnce(smsGateway.sendSMS);
            expect(message).to.length(32);
            done();
          });
      });


  });

  describe.skip("GET /sms/momt/nexmo_callback", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .get('/sms/momt/nexmo_callback')
        .expect('Content-Type', /json/);

      sandbox.stub(smsGateway, "sendSMS",
        function(msisdn, message, cb) {
          cb(null);
        });
    });

    it("should always return a 200 even if the smsBody is not found.",
       function(done) {
         jsonReq.query({msisdn: "+33123456789", text: "wrong-smsBody"})
           .expect(200).end(function(err, res) {
             sinon.assert.notCalled(smsGateway.sendSMS);
             done();
           });
       });

    it("should send a SMS with the code.", function(done) {
      sandbox.stub(storage, "popSmsCode",
        function(smsBody, cb) {
          cb(null, "123456");
        });

      sandbox.stub(storage, "setCode",
        function(hawkId, code, cb) {
          cb(null);
        });

      jsonReq.query({msisdn: "+33123456789", text: "good-smsBody"}).expect(200)
        .end(function(err, res) {
          sinon.assert.calledOnce(storage.popSmsCode);
          sinon.assert.calledOnce(storage.setCode);
          sinon.assert.calledOnce(smsGateway.sendSMS);
          done();
        });
    });
  });

  describe("POST /sms/verify_code", function() {
    var jsonReq, validPayload;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/sms/verify_code')
        .hawk(hawkCredentials)
        .type('json')
        .expect('Content-Type', /json/);

      validPayload = {
        msisdn: "+33123456789",
        code: "123456",
        publicKey: testKeyPair.publicKey,
        duration: 24 * 3600
      };
    });

    it("should require the MSISDN params", function(done) {
      delete validPayload.msisdn;
      jsonReq.send(validPayload).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn");
        done();
      });
    });

    it("should require a valid MSISDN number", function(done) {
      validPayload.msisdn = "0123456789";
      jsonReq.send(validPayload).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn",
                            "Invalid MSISDN number.");
        done();
      });
    });

    it("should require the code params", function(done) {
      delete validPayload.code;
      jsonReq.send(validPayload).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "code");
        done();
      });
    });

    it("should validate if the code is valid.", function(done) {
      sandbox.stub(storage, "verifyCode",
        function(msisdn, code, cb) {
          cb(null, true);
        });
      jsonReq.send(validPayload).expect(200).end(function(err, res) {
        if (err) {
            throw err;
        }
        
        expect(res.body.hasOwnProperty('cert')).to.equal(true);
        expect(res.body.hasOwnProperty('publicKey')).to.equal(true);
        done();
      });
    });

    it("should validate if the code is invalid.", function(done) {
      sandbox.stub(storage, "verifyCode",
        function(msisdn, code, cb) {
          cb(null, false);
        });
      jsonReq.send(validPayload).expect(403).end(done);
    });

    it("should validate if the MSISDN is not registered.", function(done) {
      sandbox.stub(storage, "verifyCode",
        function(msisdn, code, cb) {
          cb(null, null);
        });
      jsonReq.send(validPayload).expect(410).end(done);
    });
  });
});
