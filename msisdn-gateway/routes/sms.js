/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var crypto = require("crypto");
var digitsCode = require("../utils").digitsCode;
var errors = require("../errno");
var hmac = require("../hmac");
var sendError = require("../middleware").sendError;
var smsGateway = require("../sms-gateway");
var validateMSISDN = require("../middleware").validateMSISDN;
var requireParams = require("./utils").requireParams;


module.exports = function(app, conf, logError, storage, hawkMiddleware) {
  var encrypt;
  if (conf.get("fakeEncrypt")) {
    encrypt = require("../fake-encrypt");
  } else {
    encrypt = require("../encrypt");
  }

  /**
   * Ask for a new number registration.
   **/
  app.post("/sms/mt/verify", hawkMiddleware,
    requireParams("msisdn", "mcc"), validateMSISDN, function(req, res) {
      if (req.body.hasOwnProperty("mnc") && req.body.mnc.length !== 3 &&
          req.body.mnc.length !== 2) {
        sendError(
          res, 400,
          errors.INVALID_PARAMETERS, "Invalid MNC."
        );
        return;
      }

      if (req.body.mcc.length !== 3) {
        sendError(
          res, 400,
          errors.INVALID_PARAMETERS, "Invalid MCC."
        );
        return;
      }

      var mcc = req.body.mcc,
        mnc = req.body.mnc,
        code, message;

      if (!req.body.hasOwnProperty("shortVerificationCode") ||
          req.body.shortVerificationCode !== true) {
        code = crypto.randomBytes(conf.get("longCodeBytes")).toString("hex");
        message = code;
      } else {
        code = digitsCode(conf.get("shortCodeLength"));
        message = req.format(
          req.gettext("Your verification code is: %(code)s"), {code: code}
        );
      }

      storage.getMSISDN(req.hawkHmacId, function(err, cipherMsisdn) {
        if (err) {
          logError(err);
          sendError(res, 503, errors.BACKEND, "Service Unavailable");
          return;
        }

        var storedMsisdn;
        try {
          storedMsisdn = encrypt.decrypt(req.hawk.id, cipherMsisdn);
        } catch (error) {
          logError(error);
          console.error("Unable to decrypt", req.hawk.id, cipherMsisdn);
          storedMsisdn = null;
        }

        if (storedMsisdn !== null && storedMsisdn !== req.msisdn) {
          sendError(res, 400, errors.INVALID_PARAMETERS,
                    "You can validate only one MSISDN per session.");
          return;
        }

        if (cipherMsisdn === null) {
          cipherMsisdn = encrypt.encrypt(req.hawk.id, req.msisdn);
        }

        storage.storeMSISDN(req.hawkHmacId, cipherMsisdn, function(err) {
          if (err) {
            logError(err);
            sendError(res, 503, errors.BACKEND, "Service Unavailable");
            return;
          }

          storage.setCode(req.hawkHmacId, code, function(err) {
            if (err) {
              logError(err);
              sendError(res, 503, errors.BACKEND, "Service Unavailable");
              return;
            }

            /* Send SMS */
            smsGateway.numberMap.getMtSenderFor(mcc, mnc,
              function(err, mtSender) {
                if (err) {
                  logError(err);
                  sendError(res, 503, errors.BACKEND, "Service Unavailable");
                  return;
                }

                // XXX export string in l10n external file.
                smsGateway.sendSMS(mtSender, req.msisdn, message,
                  function(err, data) {
                    if (err) {
                      logError(err);
                      sendError(res, 503, errors.BACKEND, data);
                      return;
                    }
                    res.json(204, "");
                  });
              });
          });
        });
      });
    });


  /**
   * Handle Mobile Originated SMS reception
   **/

  function handleMobileOriginatedMessages(res, options) {
    smsGateway.numberMap.getMtSenderFor(options.mcc, options.mnc,
      function(err, mtSender) {
        if (err) {
          logError(err);
          sendError(res, 503, errors.BACKEND, "Service Unavailable");
          return;
        }

        var hawkId = options.text.split(" ");
        hawkId = hawkId[1];
        if (hawkId === undefined) {
          logError(options.text + " is not in the right format.");
          res.json(200, {});
          return;
        }

        var hawkHmacId = hmac(hawkId, conf.get("hawkIdSecret"));

        storage.getSession(hawkHmacId, function(err, result) {
          if (err) {
            logError(err);
            sendError(res, 503, errors.BACKEND, "Service Unavailable");
            return;
          }

          if (result === null) {
            // This session doesn't exists should answer 200
            res.json(200, {});
            return;
          }

          storage.getMSISDN(hawkHmacId, function(err, cipherMsisdn) {
            if (err) {
              logError(err);
              sendError(res, 503, errors.BACKEND, "Service Unavailable");
              return;
            }

            var storedMsisdn;
            try {
              storedMsisdn = encrypt.decrypt(hawkId, cipherMsisdn);
            } catch (error) {
              logError(error);
              console.error("Unable to decrypt", hawkId, cipherMsisdn);
              storedMsisdn = null;
            }

            if (storedMsisdn !== null && storedMsisdn !== options.msisdn) {
              logError(
                new Error("Attempt to very several MSISDN per session.", {
                  sessionId: hawkHmacId,
                  previousMsisdn: storedMsisdn,
                  currentMsisdn: options.msisdn
                })
              );

              res.json(200, {});
              return;
            }

            if (cipherMsisdn === null) {
              cipherMsisdn = encrypt.encrypt(hawkId, options.msisdn);
            }

            storage.storeMSISDN(hawkHmacId, cipherMsisdn, function(err) {
              if (err) {
                logError(err);
                sendError(res, 503, errors.BACKEND, "Service Unavailable");
                return;
              }

              var code = crypto.randomBytes(conf.get("longCodeBytes"))
                .toString("hex");

              storage.setCode(hawkHmacId, code, function(err) {
                if (err) {
                  logError(err);
                  sendError(res, 503, errors.BACKEND, "Service Unavailable");
                  return;
                }

                /* Send SMS */
                smsGateway.sendSMS(mtSender, options.msisdn, code, function(err) {
                  if (err) {
                    logError(err);
                    sendError(res, 503, errors.BACKEND, "Service Unavailable");
                    return;
                  }
                  res.json(200, {});
                });
              });
            });
          });
        });
      });
  }

  app.get("/sms/momt/nexmo_callback", function(req, res) {
    if (!req.query.hasOwnProperty("msisdn")) {
      // New number setup should answer 200
      res.json(200, {});
      return;
    }

    var options = {
      msisdn: '+' + req.query.msisdn,
      text: req.query.text
    };

    if (req.query.hasOwnProperty("network-code")) {
      options.mcc = req.query["network-code"].slice(0, 3);
      options.mnc = req.query["network-code"].slice(3, 6);
    }

    handleMobileOriginatedMessages(res, options);
  });

  app.get("/sms/momt/beepsend_callback", function(req, res) {
    if (!req.query.hasOwnProperty("from")) {
      // New number setup should answer 200
      res.json(200, {});
      return;
    }

    var options = {
      msisdn: '+' + req.query.from,
      text: req.query.message
    };

    handleMobileOriginatedMessages(res, options);
  });


  /**
   * Verify code
   **/
  app.post("/sms/verify_code", hawkMiddleware, requireParams("code"),
    function(req, res) {
      var code = req.body.code;

      // Validate code.
      if (code.length !== conf.get("shortCodeLength") &&
          code.length !== conf.get("longCodeBytes") * 2) {

        sendError(res, 400, errors.INVALID_PARAMETERS,
                  "Code should be short (" + conf.get("shortCodeLength") +
                  " characters) or long (" + conf.get("longCodeBytes") * 2 +
                  " characters).");
        return;
      }

      storage.verifyCode(req.hawkHmacId, code, function(err, result) {
        if (err) {
          logError(err);
          sendError(res, 503, errors.BACKEND, "Service Unavailable");
          return;
        }

        if (result === null) {
          sendError(res, 410, errors.EXPIRED, "Code has expired.");
          return;
        }

        if (!result) {
          storage.setCodeWrongTry(req.hawkHmacId, function(err, tries) {
            if (err) {
              logError(err);
              sendError(res, 503, errors.BACKEND, "Service Unavailable");
              return;
            }

            if (tries >= conf.get("nbCodeTries")) {
              storage.expireCode(req.hawkHmacId, function(err) {
                if (err) {
                  logError(err);
                  sendError(res, 503, errors.BACKEND, "Service Unavailable");
                  return;
                }
                sendError(res, 400, errors.INVALID_CODE, "Code error.");
              });
              return;
            }
            sendError(res, 400, errors.INVALID_CODE, "Code error.");
          });
          return;
        }

        storage.getMSISDN(req.hawkHmacId, function(err, cipherMsisdn) {
          if (err) {
            logError(err);
            sendError(res, 503, errors.BACKEND, "Service Unavailable");
            return;
          }

          if (cipherMsisdn === null) {
            sendError(res, 410, errors.EXPIRED, "Token has expired.");
            return;
          }

          var now = Date.now();

          storage.setCertificateData(req.hawkHmacId, {
            cipherMsisdn: cipherMsisdn,
            createdAt: now,
            lastUpdatedAt: now,
            hawkKey: req.hawk.key
          }, function(err) {
            if (err) {
              logError(err);
              sendError(res, 503, errors.BACKEND, "Service Unavailable");
              return;
            }

            storage.cleanVolatileData(req.hawkHmacId, function(err) {
              if (err) {
                logError(err);
                sendError(res, 503, errors.BACKEND, "Service Unavailable");
                return;
              }

              try {
                var msisdn = encrypt.decrypt(req.hawk.id, cipherMsisdn);
                res.json(200, {msisdn: msisdn});
              } catch (error) {
                logError(error);
                console.error("Unable to decrypt", req.hawk.id, cipherMsisdn);
                sendError(res, 411, errors.EXPIRED,
                          "Unable to decrypt stored MSISDN");
                return;
              }
            });
          });
        });
      });
    });
};
