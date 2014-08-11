/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var crypto = require("crypto");
var fs = require('fs');
var expect = require("chai").expect;
var addHawk = require("superagent-hawk");
var supertest = addHawk(require("supertest"));
var sinon = require("sinon");
var async = require("async");

var app = require("../msisdn-gateway").app;
var conf = require("../msisdn-gateway").conf;
var storage = require("../msisdn-gateway").storage;
var smsGateway = require("../msisdn-gateway/sms-gateway");
var Token = require("../msisdn-gateway/token").Token;
var hmac = require("../msisdn-gateway/hmac");
var errors = require("../msisdn-gateway/errno");
var encrypt;
if (conf.get("fakeEncrypt")) {
  encrypt = require("../msisdn-gateway/fake-encrypt");
} else {
  encrypt = require("../msisdn-gateway/encrypt");
}
var testKeyPair = require("./testKeyPair.json");
var range = require("./utils").range;

var mdl = require("../msisdn-gateway/middleware");

var pjson = require("../package.json");

function expectFormatedError(body, code, errno, error, message, info) {
  var errmap = {};
  if (code) {
    errmap.code = code;
  }
  if (errno) {
    errmap.errno = errno;
  }
  if (error) {
    errmap.error = error;
  }
  if (message) {
    errmap.message = message;
  }
  if (info) {
    errmap.info = info;
  }

  expect(body).eql(errmap);
}

describe("HTTP API exposed by the server", function() {

  var sandbox, genuineOrigins, hawkCredentials, hawkHmacId;

  var routes = {
    '/': ['get'],
    '/discover': ['post'],
    '/register': ['post'],
    '/unregister': ['post'],
    '/sms/mt/verify': ['post'],
    '/sms/momt/nexmo_callback': ['post'],
    '/sms/verify_code': ['post'],
    '/certificate/sign': ['post']
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
      hawkHmacId = hmac(tokenId, conf.get("hawkIdSecret"));
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
          .end(done);
      });

      it("should reject unauthorized origins to do CORS", function(done) {
        supertest(app)
          .options(route)
          .set('Origin', 'http://not-authorized')
          .end(function(err, res) {
            if (err) throw err;
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
            .end(done);
        });

        it("should reject unauthorized origins to do CORS", function(done) {
          supertest(app)[method](route)
            .set('Origin', 'http://not-authorized')
            .end(function(err, res) {
              if (err) throw err;
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
          if (err) throw err;
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
          if (err) throw err;
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
          if (err) throw err;
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
            if (err) throw err;
            expect(res.body).not.to.have.property("version");
            done();
          });
      });
  });

  describe("General request filtering", function() {
    it("should send back JSON, always", function(done) {
      supertest(app)
        .get('/unexistant')
        .expect(404)
        .end(function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, 404);
          done();
        });
    });

    it("should reject requests that are too big", function(done) {
      var res, res2;
      // create a big JSON blob
      fs.readFile( __dirname + '/DATA', function(err, data) {
        if (err) throw err;
        res = data.toString();
        res2 = data.toString();

        supertest(app)
          .post('/discover')
          .type('json')
          .send(JSON.stringify({somedata: res, somemore: res2}))
          .expect(413)
          .end(function(err, res) {
            if (err) throw err;
            done();
          });
      });
    });

    it("a 500 should send back JSON, always", function(done) {
      var _error = function(req, res) {
        /*eslint-disable */
        res.json(200, {"boom": boom.tchak});
        /*eslint-enable */
      };

      // plug an error on /error
      app.get('/error', _error);
      mdl.applyErrorLogging(app);

      supertest(app)
          .get('/error')
          .expect(500)
          .end(function(err, res) {
            if (err) throw err;
            expectFormatedError(res.body, 500, 999, "boom is not defined");
            done();
          });
    });
  });

  describe("HAWK Middleware wrong credentials handling.", function() {
    it("should return an INVALID_REQUEST_SIG on invalid Hawk parameters.",
      function(done) {
        supertest(app)
          .post('/sms/mt/verify')
          .send({msisdn: "123456"})
          .set("Authorization", "Hawk wrong-parameters")
          .expect(401)
          // .expect("WWW-Authenticate", "Hawk")
          .end(function(err, res) {
            if (err) throw err;
            expectFormatedError(res.body, 401, errors.INVALID_REQUEST_SIG,
                                "Bad header format");
            done();
          });
      });

    it("should return an INVALID_AUTH_TOKEN on invalid Hawk credentials.",
      function(done) {
        // Broke hawkCredentials
        hawkCredentials.id = crypto.randomBytes(32).toString("hex");

        supertest(app)
          .post('/sms/mt/verify')
          .send({msisdn: "123456"})
          .hawk(hawkCredentials)
          .expect(401)
          // .expect("WWW-Authenticate", "Hawk")
          .end(function(err, res) {
            if (err) throw err;
            expectFormatedError(res.body, 401, errors.INVALID_AUTH_TOKEN,
                                "Unknown credentials");
            done();
          });
      });
  });


  describe("POST /discover", function() {
    var jsonReq, previousDefault;

    beforeEach(function() {
      previousDefault = conf.get("moVerifier");
      jsonReq = supertest(app)
        .post('/discover')
        .type('json')
        .expect('Content-Type', /json/);
    });

    afterEach(function() {
      conf.set("moVerifier", previousDefault);
    });

    it("should works without the MSISDN parameter", function(done) {
      jsonReq.send({"mcc": "302"}).expect(200).end(done);
    });

    it("should take only a valid MSISDN number", function(done) {
      jsonReq.send({msisdn: "0123456789", "mcc": "302"}).expect(400).end(
        function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, 400, errors.INVALID_PARAMETERS,
                              "Invalid MSISDN number.");
          done();
        });
    });

    it("should return the sms/mt flow if the MSISDN is configured.",
      function(done) {
        jsonReq.send({msisdn: "+33623456789", "mcc": "555"}).expect(200).end(
          function(err, res) {
            if (err) throw err;
            expect(res.body).to.eql({
              "verificationMethods": ["sms/mt", "sms/momt"],
              "verificationDetails": {
                "sms/mt": {
                  "mtSender": "Mozilla@",
                  "url": "http://" + res.req._headers.host +
                    "/v1/msisdn/sms/mt/verify"
                },
                "sms/momt": {
                  "mtSender": "Mozilla@",
                  "moVerifier": "456"
                }
              }
            });
            done();
          });
      });

    it("should return the sms/momt flow if the MSISDN is not configured.",
      function(done) {
        jsonReq.send({"mcc": "555"}).expect(200).end(function(err, res) {
          if (err) throw err;
          expect(res.body).to.eql({
            "verificationMethods": ["sms/momt"],
            "verificationDetails": {
              "sms/momt": {
                "mtSender": "Mozilla@",
                "moVerifier": "456"
              }
            }
          });
          done();
        });
      });

    it("should return the sms/momt flow with the MCC specific number.",
      function(done) {
        jsonReq.send({"mcc": "302"}).expect(200).end(function(err, res) {
          if (err) throw err;
          expect(res.body).to.eql({
            "verificationMethods": ["sms/momt"],
            "verificationDetails": {
              "sms/momt": {
                "mtSender": "+1...",
                "moVerifier": "+1..."
              }
            }
          });
          done();
        });
      });

    it("should return the sms/mt flow if no moVerifier number and no MSISDN.",
      function(done) {
        conf.set("moVerifier", "");
        jsonReq.send({"mcc": "512"}).expect(200).end(function(err, res) {
          if (err) throw err;
          expect(res.body).to.eql({
            "verificationMethods": ["sms/mt"],
            "verificationDetails": {
              "sms/mt": {
                "mtSender": "Mozilla@",
                "url": "http://" + res.req._headers.host +
                  "/v1/msisdn/sms/mt/verify"
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
      jsonReq.send({msisdn: "+33623456789"}).expect(200).end(
        function(err, res) {
          if (err) throw err;
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
        .type('json');
    });

    it("should clean the session.", function(done) {
      jsonReq.send({msisdn: "+33623456789"}).expect(204).end(
        function(err, res, tokenId) {
          if (err) throw err;
          storage.getSession(tokenId, function(err, result) {
            if (err) throw err;
            expect(result).to.equal(null);
            done();
          });
        });
    });
  });

  describe("POST /sms/mt/verify", function() {
    var jsonReq, buildJsonReq;

    beforeEach(function() {
      buildJsonReq = function buildJsonReq() {
        return supertest(app)
          .post('/sms/mt/verify')
          .hawk(hawkCredentials)
          .type('json');
      };
      jsonReq = buildJsonReq();
    });

    it("should require a valid MSISDN number", function(done) {
      jsonReq.send({msisdn: "0623456789", mcc: "271", mnc: "07"})
        .expect(400)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, 400, errors.INVALID_MSISDN,
                              "Invalid MSISDN number.");
          done();
        });
    });

    it("should require MCC/MNC codes", function(done) {
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(
        function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, 400, errors.MISSING_PARAMETERS,
                              "Missing mcc");
          done();
        });
    });

    it("should works only with a MCC code", function(done) {
      // var message;
      sandbox.stub(smsGateway, "sendSMS",
        function(from, msisdn, msg, cb) {
          // message = msg;
          cb(null);
        });
      jsonReq.send({msisdn: "+33623456789", "mcc": "217"})
        .expect(200).end(
          function(err /*, res */) {
            if (err) throw err;
            sinon.assert.calledOnce(smsGateway.sendSMS);
            done();
          });
    });

    it("should send a SMS with the long code by default.", function(done) {
      var message;
      sandbox.stub(smsGateway, "sendSMS",
        function(from, msisdn, msg, cb) {
          message = msg;
          cb(null);
        });
      jsonReq.send({msisdn: "+33623456789", "mcc": "217", "mnc": "07"})
        .expect(204).end(function(err /*, res*/) {
          if (err) throw err;
          sinon.assert.calledOnce(smsGateway.sendSMS);
          expect(message).to.length(32);
          done();
        });
    });

    it("should send a SMS with a short code if shortVerificationCode is true.",
      function(done) {
        var message;
        sandbox.stub(smsGateway, "sendSMS",
          function(from, msisdn, msg, cb) {
            message = msg;
            cb(null);
          });
        jsonReq.send({
          msisdn: "+33623456789",
          mcc: "217",
          mnc: "204",
          shortVerificationCode: true
        }).expect(204).end(
          function(err /*, res */) {
            if (err) throw err;
            sinon.assert.calledOnce(smsGateway.sendSMS);
            var code = message.substr(message.length - 6);
            expect(message).to.eql("Your verification code is: " + code);
            expect(isNaN(parseInt(code, 10))).to.eql(false);
            done();
          });
      });

    it("should send a SMS with the long code if shortVerificationCode " +
       "is false.", function(done) {
        var message;
        sandbox.stub(smsGateway, "sendSMS",
          function(from, msisdn, msg, cb) {
            message = msg;
            cb(null);
          });
         jsonReq.send({
           msisdn: "+33623456789",
           mcc: "217",
           mnc: "204",
           shortVerificationCode: false
         }).expect(204).end(
          function(err /*, res */) {
            if (err) throw err;
            sinon.assert.calledOnce(smsGateway.sendSMS);
            expect(message).to.length(32);
            done();
          });
      });

    it("should not accept another number verification for the same session",
      function(done) {
        sandbox.stub(smsGateway, "sendSMS",
          function(from, msisdn, msg, cb) {
            cb(null);
          });
         jsonReq.send({
           msisdn: "+33623456789",
           mcc: "217",
           mnc: "07"
         }).expect(204).end(
          function(err /*, res */) {
            if (err) throw err;
            buildJsonReq().send({
              msisdn: "+33614365879",
              mcc: "217",
              mnc: "07"
            }).expect(400).expect('Content-Type', /json/)
              .end(function(err, res) {
                if (err) throw err;
                expectFormatedError(res.body, 400, errors.INVALID_PARAMETERS,
                  "You can validate only one MSISDN per session.");
                done();
              });
          });
      });
  });

  describe("GET /sms/momt/nexmo_callback", function() {
    var buildJsonReq, jsonReq;

    beforeEach(function() {
      buildJsonReq = function buildJsonReq() {
        return supertest(app)
          .get('/sms/momt/nexmo_callback')
          .expect('Content-Type', /json/);
      };
      jsonReq = buildJsonReq();

      sandbox.stub(smsGateway, "sendSMS",
        function(from, msisdn, msg, cb) {
          // message = msg;
          cb(null);
        });
    });

    it("should always return a 200 even with no msisdn.", function(done) {
       jsonReq.query()
         .expect(200).end(function(err /*, res */) {
           if (err) throw err;
           sinon.assert.notCalled(smsGateway.sendSMS);
           done();
         });
    });

    it("should always return a 200 even if the smsBody is not found.",
       function(done) {
         jsonReq.query({msisdn: "33623456789", text: "wrong-smsBody"})
           .expect(200).end(function(err /*, res */) {
             if (err) throw err;
             sinon.assert.notCalled(smsGateway.sendSMS);
             done();
           });
       });

    it("should not send a sms if another number try to register to session.",
       function(done) {
         jsonReq.query({
           msisdn: "33623456789",
           "network-code": "21407",
           text: "/sms/momt/verify " + hawkCredentials.id
         }).expect(200).end(function(err /*, res */) {
           if (err) throw err;
           sinon.assert.called(smsGateway.sendSMS);
           smsGateway.sendSMS.reset();

           buildJsonReq().query({
             msisdn: "33214365879",
             text: "/sms/momt/verify " + hawkCredentials.id
           }).expect(200).end(function(err /*, res */) {
             if (err) throw err;
             sinon.assert.notCalled(smsGateway.sendSMS);
             done();
           });
         });
       });

    it("should send a SMS with the code using the network-code.",
      function(done) {
        jsonReq.query({
          msisdn: "33623456789",
          "network-code": "21407",
          text: "/sms/momt/verify " + hawkCredentials.id
        }).expect(200).end(function(err /*, res */) {
          if (err) throw err;
          sinon.assert.called(smsGateway.sendSMS);
          storage.getMSISDN(hawkHmacId, function(err, msisdn) {
            if (err) throw err;
            expect(
              encrypt.decrypt(hawkCredentials.id, msisdn)
            ).to.eql("+33623456789");
            done();
          });
        });
    });

    it("should send a SMS with the code.", function(done) {
         jsonReq.query({
           msisdn: "33623456789",
           text: "/sms/momt/verify " + hawkCredentials.id
         }).expect(200).end(function(err /*, res */) {
           if (err) throw err;
           sinon.assert.called(smsGateway.sendSMS);
           storage.getMSISDN(hawkHmacId, function(err, msisdn) {
             if (err) throw err;
             expect(
               encrypt.decrypt(hawkCredentials.id, msisdn)
             ).to.eql("+33623456789");
             done();
           });
         });
    });
  });

  describe("POST /sms/verify_code", function() {
    var buildJsonReq, jsonReq, validPayload;

    beforeEach(function() {
      buildJsonReq = function buildJsonReq() {
        return supertest(app)
          .post('/sms/verify_code')
          .hawk(hawkCredentials)
          .type('json')
          .expect('Content-Type', /json/);
      };
      jsonReq = buildJsonReq();

      validPayload = {
        code: "123456"
      };
    });

    it("should require the code params", function(done) {
      delete validPayload.code;
      jsonReq.send(validPayload).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, 400, errors.MISSING_PARAMETERS,
                            "Missing code");
        done();
      });
    });

    it("should validate if the code is valid.", function(done) {
      var msisdn = "+33623456789";
      storage.setCode(hawkHmacId, "123456", function(err) {
        if (err) throw err;
        storage.storeMSISDN(
          hawkHmacId, encrypt.encrypt(hawkCredentials.id, msisdn),
          function(err) {
            if (err) throw err;
            jsonReq.send(validPayload).expect(200).end(function(err, res) {
              if (err) {
                console.log(res);
                throw err;
              }

              expect(res.body.hasOwnProperty('msisdn')).to.equal(true);
              done();
            });
          });
      });
    });

    it("should invalidate the code after three wrong tries.", function(done) {
      storage.setCode(hawkHmacId, "123456", function(err) {
        if (err) throw err;
        async.map(range(conf.get("nbCodeTries")),
          function(id, done) {
            buildJsonReq().send({"code": "654321"}).expect(400).end(done);
          },
          function(err /*, results */) {
            if (err) throw err;
            jsonReq.send({"code": "654321"}).expect(410).end(
              function(err /*, res */) {
                if (err) throw err;
                storage.verifyCode(hawkHmacId, "123456",
                  function(err, result) {
                    if (err) throw err;
                    expect(result).to.eql(null);
                    done();
                  });
              });
          });
      });
    });

    it("should validate if the code format is invalid.", function(done) {
      jsonReq.send({code: "123456789"}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, 400, errors.INVALID_PARAMETERS,
          "Code should be short (6 characters) or long (32 characters).");
        done();
      });
    });

    it("should validate if the MSISDN expired.", function(done) {
      sandbox.stub(storage, "verifyCode",
        function(msisdn, code, cb) {
          cb(null, true);
        });
      sandbox.stub(storage, "getMSISDN",
        function(hawkHmacId, cb) {
          cb(null, null);
        });
      jsonReq.send(validPayload).expect(410).end(done);
    });

    it("should setCertificateData.", function(done) {
      var msisdn = "+33623456789";
      storage.setCode(hawkHmacId, "123456", function(err) {
        if (err) throw err;
        storage.storeMSISDN(
          hawkHmacId, encrypt.encrypt(hawkCredentials.id, msisdn),
          function(err) {
            if (err) throw err;
            var now = Date.now();
            jsonReq.send(validPayload).expect(200).end(function(err, res) {
              if (err) throw err;
              expect(res.body.msisdn).to.equal(msisdn);
              storage.getCertificateData(hawkHmacId,
                function(err, certificateData) {
                  if (err) throw err;
                  expect(
                    encrypt.decrypt(hawkCredentials.id,
                                    certificateData.cipherMsisdn)
                  ).to.eql(msisdn);
                  expect(certificateData.createdAt).to.be.at.least(now);
                  expect(certificateData.lastUpdatedAt).to.be.at.least(now);
                  done();
                });
            });
          });
      });
    });

    it("should prune volatileData when setting persistent ones.",
      function(done) {
        var msisdn = "+33623456789";
        storage.setCode(hawkHmacId, "123456", function(err) {
          if (err) throw err;
          storage.storeMSISDN(
            hawkHmacId, encrypt.encrypt(hawkCredentials.id, msisdn),
            function(err) {
              if (err) throw err;
              jsonReq.send(validPayload).expect(200).end(function(err, res) {
                if (err) throw err;
                expect(res.body.msisdn).to.equal(msisdn);
                storage.getSession(hawkHmacId, function(err, result) {
                  if(err) throw err;
                  expect(result).to.eql(null);
                  done();
                });
              });
            });
        });
      });
  });

  describe("POST /certificate/sign", function() {
    var jsonReq, validPayload;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/certificate/sign')
        .hawk(hawkCredentials)
        .type('json')
        .expect('Content-Type', /json/);

      validPayload = {
        publicKey: JSON.stringify(testKeyPair.publicKey),
        duration: 24 * 3600
      };
    });

    it("should require the publicKey params", function(done) {
      delete validPayload.publicKey;
      jsonReq.send(validPayload).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, 400, errors.MISSING_PARAMETERS,
                            "Missing publicKey");
        done();
      });
    });

    it("should require the duration params", function(done) {
      delete validPayload.duration;
      jsonReq.send(validPayload).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, 400, errors.MISSING_PARAMETERS,
                            "Missing duration");
        done();
      });
    });

    it("should fail with an unregister MSISDN.", function(done) {
      jsonReq.send(validPayload).expect(410).end(done);
    });

    it("should success with a registered MSISDN.", function(done) {
      var msisdn = "+33623456789";
      var now = Date.now();
      storage.setCertificateData(hawkHmacId, {
        cipherMsisdn: encrypt.encrypt(hawkCredentials.id, msisdn),
        createdAt: now,
        lastUpdatedAt: now,
        key: "fakeHmacKey"
      }, function(err) {
        if (err) throw err;
        jsonReq.send(validPayload).expect(200).end(function(err, res) {
          if (err) {
            console.log(res.body);
            throw err;
          }
          expect(res.body.hasOwnProperty("cert")).to.eql(true);
          storage.getCertificateData(hawkHmacId,
            function(err, certificateData) {
              if (err) throw err;
              expect(certificateData.createdAt).to.equal(now);
              expect(certificateData.lastUpdatedAt).to.not.equal(now);
              done();
            });
        });
      });
    });
  });

  describe("GET /.well-known/browserid", function(/* done */) {
    it("should return the publickey and mandatory metadata.", function(done) {
      supertest(app)
        .get('/.well-known/browserid')
        .type('json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.hasOwnProperty("public-key")).to.eql(true);
          expect(res.body.authentication).to.equal(
            "/.well-known/browserid/warning.html");
          expect(res.body.provisioning).to.equal(
            "/.well-known/browserid/warning.html");
          done();
        });
    });

    it("should answer an error on /.well-known/browserid/warning.html",
      function(done) {
        supertest(app)
          .get('/.well-known/browserid/warning.html')
          .expect('Content-Type', /html/)
          .expect(200).end(done);
      });
  });

  describe("GET /api-specs", function(/* done */) {
    it("should return the Videur api spec file.", function(done) {
      supertest(app)
        .get('/api-specs')
        .type('json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          var spec = res.body;

          expect(spec.service.location).to.match(/http:\/\/127.0.0.1:(\d)+/);
          expect(spec.service.version, pjson.version);
          done();
        });
    });
  });

});
