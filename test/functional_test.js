/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var expect = require("chai").expect;
var supertest = require("supertest");
var sinon = require("sinon");

var app = require("../msisdn-gateway").app;
var request = require('../msisdn-gateway').request;
var conf = require("../msisdn-gateway").conf;
var storage = require("../msisdn-gateway").storage;

function getMiddlewares(method, url) {
  return app.routes[method].filter(function(e){
    return e.path === url;
  }).shift().callbacks;
}

function intersection(array1, array2) {
  return array1.filter(function(n) {
    return array2.indexOf(n) !== -1;
  });
}

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
    '/': ['get']
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
});
