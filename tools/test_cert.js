#!/usr/bin/env node
"use strict";

var browserid = require('browserid-local-verify');
var gen = require("../msisdn-gateway/utils").generateCertificate;
var jwcrypto = require('jwcrypto');
// Make sure to load supported algorithms.
require('jwcrypto/lib/algs/rs');
require('jwcrypto/lib/algs/ds');

var request = require('request');

var privateKey = require('./keys.json').BIDSecretKey;
privateKey = jwcrypto.loadSecretKeyFromObject(privateKey);

var publicKey = require('./keys.json').providedPublicKey;

var msisdn = 'xxx';
var duration = 3600;
var audience = "http://loop.dev.mozaws.net";
var audiences = ["http://loop.dev.mozaws.net", "app://loop.dev.mozaws.net"];
var trustedIssuers = ["api.accounts.firefox.com", "msisdn-dev.stage.mozaws.net"];


// generate an assertion (and keypair and signed cert if required)
function createAssertion(cert, cb) {
  var self = this;
  var issuedAt = new Date().getTime();
  var expiresAt = (issuedAt + (2 * 60 * 1000));

  jwcrypto.assertion.sign(
      {}, {audience: audience, expiresAt: expiresAt, issuedAt: issuedAt},
      privateKey,
      function(err, signedContents) {
        if (err) return cb(err);
        var assertion = jwcrypto.cert.bundle([cert], signedContents);
        cb(null, assertion);
      });
};


function verifyAssertion(assertion, callback) {
  request.post({
    uri: 'https://verifier.accounts.firefox.com/v2',
    json: {
      audience: audience,
      assertion: assertion
    }
  }, function(err, message, data) {
    if (err) {
      callback(err);
      return;
    }
    // Check the issuer is trusted.
    if (data.status !== "okay") {
      callback(data.reason);
      return;
    }
    if (trustedIssuers.indexOf(data.issuer) === -1) {
      callback("Issuer is not trusted");
      return;
    }
    callback(null, data);
  });
}

/* generate the cert */
gen(msisdn, 'host', publicKey, privateKey, duration, function (err, cert) {
  if (err) {
    console.log(err);
    return;
  } else {
    createAssertion(cert, function(err, assertion) {
      verifyAssertion(assertion, function (err, data) {
        if (err) {
          console.log(err);
          return;
        }
        console.log(data);
      });
    });
  }
});
