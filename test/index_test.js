/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var expect = require("chai").expect;
var supertest = require("supertest");

var app = require("../msisdn-gateway").app;
var requireParams = require("../msisdn-gateway").requireParams;


describe("index.js", function() {
  var jsonReq;

  beforeEach(function() {
    jsonReq = supertest(app);
  });

  describe("#requireParams", function(){
    // Create a route with the requireParams middleware installed.
    app.post('/requireParams/', requireParams('a', 'b'), function(req, res) {
      res.json(200, "ok");
    });

    it("should return a 406 if the body is not in JSON.", function(done) {
      jsonReq
        .post('/requireParams/')
        .set('Accept', 'text/html')
        .expect(406, /json/)
        .end(done);
    });

    it("should return a 400 if one of the required params are missing.",
      function(done) {
        jsonReq
          .post('/requireParams/')
          .send({a: "Ok"})
          .expect(400)
          .end(function(err, res) {
            if (err) throw err;
            expect(res.body).eql({
              status: "errors",
              errors: [{location: "body",
                        name: "b",
                        description: "missing: b"}]
            });
            done();
          });
      });

    it("should return a 400 if all params are missing.", function(done) {
      jsonReq
        .post('/requireParams/')
        .send({})
        .expect(400)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body).eql({
            status: "errors",
            errors: [{location: "body",
                      name: "a",
                      description: "missing: a"},
                     {location: "body",
                      name: "b",
                      description: "missing: b"}]
          });
          done();
        });
    });

    it("should return a 200 if all the params are presents.", function(done) {
      jsonReq
        .post('/requireParams/')
        .send({a: "Ok", b: "Ok"})
        .expect(200)
        .end(done);
    });
  });
});
