#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var gen = require("../msisdn-gateway/utils").generateCertificate;

var jwcrypto = require('jwcrypto');

// Make sure to load supported algorithms.
require('jwcrypto/lib/algs/rs');
require('jwcrypto/lib/algs/ds');

var request = require('request');
var conf = require('./test_cert_conf.json');

var serverPrivateKey = jwcrypto.loadSecretKeyFromObject(conf.BIDSecretKey);
var clientPublicKey = conf.clientPublicKey;
var clientPrivateKey = jwcrypto.loadSecretKeyFromObject(conf.clientSecretKey);
var msisdn = conf.msisdn || "xxx";
var duration = parseInt(conf.duration, 10) || 3600;
var audience = conf.audience || "http://loop.dev.mozaws.net";
var host = conf.host;
var trustedIssuers = conf.trustedIssuers || [host];

host = conf.host || "msisdn-dev.stage.mozaws.net";

// generate an assertion (and keypair and signed cert if required)
function createAssertion(cert, cb) {
  var issuedAt = Date.now();
  var expiresAt = (issuedAt + (2 * 60 * 1000));

  jwcrypto.assertion.sign(
    {}, {audience: audience, expiresAt: expiresAt, issuedAt: issuedAt},
    clientPrivateKey,
    function(err, signedContents) {
      if (err) return cb(err);
      var assertion = jwcrypto.cert.bundle([cert], signedContents);
      cb(null, assertion);
    });
}

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
    // Check that the issuer is trusted.
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
gen(msisdn, host, clientPublicKey, serverPrivateKey, duration,
  function (err, cert) {
    if (err) {
      console.log(err);
      return;
    } else {
      createAssertion(cert, function(err, assertion) {
        if (err) {
          console.log(err);
          return;
        }
        verifyAssertion(assertion, function (err, data) {
          if (err) {
            console.log(err);
            return;
          }
          console.log(data);
        });
      });
    }
  }
);
