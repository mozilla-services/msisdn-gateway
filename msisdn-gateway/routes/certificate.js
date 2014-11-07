/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var errors = require("../errno");
var sendError = require("../middleware").sendError;
var requireParams = require("./utils").requireParams;
var validateJWCryptoKey = require("../utils").validateJWCryptoKey;
var generateCertificate = require("../utils").generateCertificate;

var bidcrypto = require('browserid-crypto');

// Make sure to load supported algorithms.
require('browserid-crypto/lib/algs/rs');
require('browserid-crypto/lib/algs/ds');

module.exports = function(app, conf, logError, storage, hawkMiddleware) {
  var _privKey = bidcrypto.loadSecretKeyFromObject(conf.get('BIDSecretKey'));

  var encrypt;
  if (conf.get("fakeEncrypt")) {
    encrypt = require("../fake-encrypt");
  } else {
    encrypt = require("../encrypt");
  }

  /**
   * Generate certificate
   **/
  app.post("/certificate/sign", hawkMiddleware, requireParams(
    "duration", "publicKey"), function(req, res) {
      var publicKey;
      try {
        publicKey = JSON.parse(req.body.publicKey);
      } catch (err) {
        sendError(res, 406, errors.BADJSON, err);
        return;
      }
      var duration = parseInt(req.body.duration, 10);

      // Validate publicKey.
      try {
        validateJWCryptoKey(publicKey);
      } catch (err) {
        // not sending back the error for security
        sendError(res, 400, errors.INVALID_PARAMETERS, "Bad Public Key.");
        return;
      }

      // Validate duration.
      if (typeof duration !== "number" || duration < 1) {
        sendError(res, 400, errors.INVALID_PARAMETERS,
                  "Duration should be a number of seconds.");
        return;
      }

      storage.getCertificateData(req.hawkHmacId, function(err, certificateData) {
        if (err) {
          logError(err);
          sendError(res, 503, errors.BACKEND, "Service Unavailable");
          return;
        }

        if (certificateData === null) {
          sendError(res, 410, errors.EXPIRED, "Validation has expired.");
          return;
        }

        var msisdn = encrypt.decrypt(
          req.hawk.id,
          certificateData.cipherMsisdn
        );

        // Generate a certificate
        generateCertificate(msisdn, req.get("host"), certificateData.createAt,
          publicKey, _privKey, duration, function (err, cert, now) {
            if (err) {
              logError(err);
              sendError(res, 503, errors.BACKEND, "Service Unavailable");
              return;
            }

            certificateData.lastUpdatedAt = now;
            storage.setCertificateData(
              req.hawkHmacId, certificateData, function(err) {
                if (err) {
                  logError(err);
                  sendError(res, 503, errors.BACKEND, "Service Unavailable");
                  return;
                }
                res.json(200, {cert: cert});
              });
          });
      });
    });
};
