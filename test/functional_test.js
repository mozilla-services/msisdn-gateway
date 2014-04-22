/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var expect = require("chai").expect;
var supertest = require("supertest");
var sinon = require("sinon");

var app = require("../msisdn-gateway").app;
var conf = require("../msisdn-gateway").conf;
var storage = require("../msisdn-gateway").storage;
var smsGateway = require("../msisdn-gateway/sms-gateway");

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

  var sandbox, genuineOrigins;

  var routes = {
    '/': ['get'],
    '/register': ['post'],
    '/verify_code': ['post'],
    '/resend_code': ['post'],
    '/unregister': ['post'],
  };

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    genuineOrigins = conf.get('allowedOrigins');
    conf.set('allowedOrigins', ['http://mozilla.org',
                                'http://mozilla.com']);
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

  describe("POST /register", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/register')
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
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn",
                            "Invalid MSISDN number.");
        done();
      });
    });

    it("should send an SMS with the code.", function(done) {
      sandbox.stub(smsGateway, "sendSMS",
        function(msisdn, message, cb) {
          cb(null);
        });
      jsonReq.send({msisdn: "+33123456789"}).expect(200).end(
        function(err, res) {
          sinon.assert.calledOnce(smsGateway.sendSMS);
          expect(res.body.id).to.length(64);
          expect(res.body.key).to.length(64);
          expect(res.body.algorithm).to.equal("sha256");
          done();
        });
    });
  });

  describe("POST /verify_code", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/verify_code')
        .type('json')
        .expect('Content-Type', /json/);
    });

    it("should require the MSISDN params", function(done) {
      jsonReq.send({code: "124563"}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn");
        done();
      });
    });

    it("should require a valid MSISDN number", function(done) {
      jsonReq.send({msisdn: "0123456789", code: "123456"}).expect(400).end(
        function(err, res) {
          if (err) throw err;
          expectFormatedError(res.body, "body", "msisdn",
                              "Invalid MSISDN number.");
          done();
        });
    });

    it("should require the code params", function(done) {
      jsonReq.send({msisdn: "+33123456789"}).expect(400).end(
        function(err, res) {
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
      jsonReq.send({msisdn: "+33123456789", code: "123456"}).expect(200).end(
        function(err, res) {
          expect(res.body.hasOwnProperty('cert')).to.equal(true);
          done();
        });
    });

    it("should validate if the code is invalid.", function(done) {
      sandbox.stub(storage, "verifyCode",
        function(msisdn, code, cb) {
          cb(null, false);
        });
      jsonReq.send({msisdn: "+33123456789", code: "123456"})
             .expect(403).end(done);
    });

    it("should validate if the MSISDN is not registered.", function(done) {
      sandbox.stub(storage, "verifyCode",
        function(msisdn, code, cb) {
          cb(null, null);
        });
      jsonReq.send({msisdn: "+33123456789", code: "123456"})
             .expect(404).end(done);
    });
  });

  describe("POST /resend_code", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/resend_code')
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
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn",
                            "Invalid MSISDN number.");
        done();
      });
    });

    it("should send an SMS with the code.", function(done) {
      sandbox.stub(smsGateway, "sendSMS",
        function(msisdn, message, cb) {
          cb(null);
        });
      jsonReq.send({msisdn: "+33123456789"}).expect(200).end(done);
    });
  });

  describe("POST /unregister", function() {
    var jsonReq;

    beforeEach(function() {
      jsonReq = supertest(app)
        .post('/unregister')
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
      jsonReq.send({msisdn: "0123456789"}).expect(400).end(function(err, res) {
        if (err) throw err;
        expectFormatedError(res.body, "body", "msisdn",
                            "Invalid MSISDN number.");
        done();
      });
    });

    it("should clean the session.", function(done) {
      sandbox.stub(storage, "cleanSession",
        function(msisdn, cb) {
          cb(null);
        });
      jsonReq.send({msisdn: "+33123456789"}).expect(200).end(done);
    });
  });
});
