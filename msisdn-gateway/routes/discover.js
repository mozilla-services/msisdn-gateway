/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var errors = require("../errno");
var phone = require("phone");
var sendError = require("../middleware").sendError;
var smsGateway = require("../sms-gateway");


module.exports = function(app, conf, logError) {
  /**
   * Return the best verification method wrt msisdn, mcc, mnc, roaming
   **/
  app.post("/discover", function(req, res) {
    var verificationMethods = [],
        verificationDetails = {},
        url, mcc, mnc;

    if (!req.body.hasOwnProperty("mcc") || req.body.mcc.length !== 3) {
      sendError(
        res, 400,
        errors.INVALID_PARAMETERS,
        "Invalid MCC."
      );
      return;
    }

    mcc = req.body.mcc;

    if (req.body.hasOwnProperty("mnc") &&
        (req.body.mnc.length === 3 || req.body.mnc.length === 2)) {
      mnc = req.body.mnc;
    }

    smsGateway.numberMap.getMoVerifierFor(mcc, mnc, function(err, moVerifier) {
      if (err) {
        logError(err);
        sendError(res, 503, errors.BACKEND, "Service Unavailable");
        return;
      }

      smsGateway.numberMap.getMtSenderFor(mcc, mnc, function(err, mtSender) {
        if (err) {
          logError(err);
          sendError(res, 503, errors.BACKEND, "Service Unavailable");
          return;
        }

        if (req.body.hasOwnProperty("msisdn") || moVerifier === null) {
          var msisdn = phone(req.body.msisdn);
          if (msisdn.length === 2) {
            msisdn = msisdn[0];
          } else {
            msisdn = null;
          }
          if (msisdn === null && moVerifier !== null) {
            sendError(res, 400,
                      errors.INVALID_PARAMETERS, "Invalid MSISDN number.");
            return;
          }

          // SMS/MT methods configuration
          url = conf.get("protocol") + "://" + req.get("host") +
            conf.get("apiPrefix") + "/sms/mt/verify";

          verificationMethods.push("sms/mt");
          verificationDetails["sms/mt"] = {
            mtSender: mtSender,
            url: url
          };
        }

        if (moVerifier !== null) {
          // SMS/MOMT methods configuration
          verificationMethods.push("sms/momt");
          verificationDetails["sms/momt"] = {
            mtSender: mtSender,
            moVerifier: moVerifier
          };
        }

        res.json(200, {
          verificationMethods: verificationMethods,
          verificationDetails: verificationDetails
        });
      });
    });
  });
};
