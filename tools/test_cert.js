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

var cert;
var msisdn = 'xxx';
var duration = 3600;


/* generate the cert */
gen(msisdn, 'host', publicKey, privateKey, duration, function (err, cert) {
  if (err) {
    console.log(err);
    return
  } else {
    cert = cert;
  }
});

// generate an assertion (and keypair and signed cert if required)
function createAssertion(args, cb) {
  var self = this;
  self.certificate(function(err) {
    if (err) return cb(err);

    // NOTE: historically assertions have not contained issuedAt, but jwcrypto
    // will check it if provided. we hope it becomes part of the spec and test
    // here.
    var issuedAt = (args.issueTime * 1000) || new Date().getTime();
    var expiresAt = (issuedAt + (2 * 60 * 1000));
    jwcrypto.assertion.sign(
      {}, { audience: args.audience, expiresAt: expiresAt, issuedAt: issuedAt },
      self._secretKey,
      function(err, signedContents) {
        if (err) return cb(err);
        var assertion = jwcrypto.cert.bundle([self._certificate], signedContents);
        cb(null, assertion);
      });
  });
};

/* verify */

// we need to generate the assertion from the cert
//var assertion = createAssertion(cert);


var audiences = ["http://loop.dev.mozaws.net", "app://loop.dev.mozaws.net"];
var fxaTrustedIssuers = ["api.accounts.firefox.com", "msisdn-dev.stage.mozaws.net"];


function verifyAssertion(assertion, callback) {
  request.post({
    uri: 'https://verifier.accounts.firefox.com/v2',
    json: {
      audience: audiences,
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



verifyAssertion(cert, function (err, data) {
    if (err) {
      console.log(err);
      return;
    }
    console.log(data);
  }
);

