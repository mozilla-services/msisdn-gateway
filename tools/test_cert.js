#!/usr/bin/env node
"use strict";

var gen = require("../msisdn-gateway/utils").generateCertificate;
var jwcrypto = require('jwcrypto');
// Make sure to load supported algorithms.
require('jwcrypto/lib/algs/rs');
require('jwcrypto/lib/algs/ds');


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
    console.log(cert);
  }
});


/* ask https://verifier.accounts.firefox.com/v2 if it's valid
 * */


