/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var express = require("express");
var crypto = require("crypto");
var conf = require("./config").conf;
var pjson = require("../package.json");
var raven = require("raven");
var phone = require("phone");
var cors = require("cors");
var logging = require("express-logging");
var headers = require("./headers");
var digitsCode = require("./utils").digitsCode;
var smsGateway = require("./sms-gateway");
var hmac = require("./hmac");
var validateMSISDN = require("./middleware").validateMSISDN;
var sendError = require("./middleware").sendError;
var checkHeaders = require("./middleware").checkHeaders;
var handle404 = require("./middleware").handle404;
var applyErrorLogging = require("./middleware").applyErrorLogging;
var Token = require("./token").Token;
var validateJWCryptoKey = require("./utils").validateJWCryptoKey;
var Hawk = require('hawk');
var uuid = require('node-uuid');
var errors = require("./errno");
var jwcrypto = require('jwcrypto');
var i18n = require('./i18n')(conf.get('i18n'));

if (conf.get("fakeEncrypt")) {
  var encrypt = require("./fake-encrypt");
} else {
  var encrypt = require("./encrypt");
}

// Configure http and https globalAgent
var http = require('http');
var https = require('https');
https.globalAgent.maxSockets = conf.get('maxHTTPSockets');
http.globalAgent.maxSockets = conf.get('maxHTTPSockets');

// Make sure to load supported algorithms.
require('jwcrypto/lib/algs/rs');
require('jwcrypto/lib/algs/ds');

var _publicKey = jwcrypto.loadPublicKeyFromObject(conf.get('BIDPublicKey'));
var _privKey = jwcrypto.loadSecretKeyFromObject(conf.get('BIDSecretKey'));

var ravenClient = new raven.Client(conf.get("sentryDSN"));

var getStorage = require("./storage");
var storage = getStorage(conf.get("storage"), {
  hawkSessionDuration: conf.get("hawkSessionDuration")
});

function logError(err) {
  console.log(err);
  ravenClient.captureError(err);
}

var app = express();

if (conf.get("env") === "development") {
  app.use(logging(conf.get("consoleDateFormat")));
}
app.use(i18n);
app.use(headers);
app.disable("x-powered-by");
app.use(checkHeaders);
var limit = conf.get("requestMaxSize");
app.use(express.json({limit: limit}));
app.use(express.urlencoded({limit: limit}));

app.use(app.router);
// Exception logging should come at the end of the list of middlewares.
app.use(raven.middleware.express(conf.get("sentryDSN")));
applyErrorLogging(app);

// When we arrive here without having send the response it is a 404
// Handle404 is the last route after the app.router and other error handling.
app.use(handle404);


var corsEnabled = cors({
  origin: function(origin, callback) {
    var acceptedOrigin = conf.get("allowedOrigins").indexOf(origin) !== -1;
    callback(null, acceptedOrigin);
  },
  // Configures the Access-Control-Allow-Credentials CORS header, required
  // until we stop sending cookies.
  credentials: true
});

function requireParams() {
  var params = Array.prototype.slice.call(arguments);
  return function(req, res, next) {
    var missingParams;

    if (!req.accepts("json")) {
      res.json(406, ["application/json"]);
      return;
    }

    missingParams = params.filter(function(param) {
      return req.body[param] === undefined;
    });

    if (missingParams.length > 0) {
      sendError(res, 400, errors.MISSING_PARAMETERS,
                "Missing " + missingParams.join());
      return;
    }
    next();
  };
}

/**
 * The Hawk middleware.
 *
 * Checks that the requests are authenticated with hawk, and sign the
 * responses.
 */
function hawkMiddleware(req, res, next) {
  Hawk.server.authenticate(req, function(id, callback) {
    var hawkHmacId = hmac(id, conf.get("hawkIdSecret"));
    storage.getSession(hawkHmacId, function(err, sessionKey) {
      if (err) {
        callback(err);
        return;
      }
      if (sessionKey === null) {
        storage.getCertificateData(hawkHmacId,
          function(err, certificateData) {
            if (err) {
              callback(err);
              return;
            }
            if (certificateData === null) {
              callback(null, null);
              return;
            }
            callback(null, {
              key: certificateData.hawkKey,
              algorithm: "sha256"
            });
          });
        return;
      }
      callback(null, sessionKey);
    });
  }, {},
    function(err, credentials, artifacts) {
      req.hawk = artifacts;

      if (err) {
        if (!err.isMissing && !err.isBoom) {
          logError(err, artifacts);
        }

        // In case no supported authentication was specified, challenge the
        // client.

        res.setHeader("WWW-Authenticate",
                      err.output.headers["WWW-Authenticate"]);

        var errno = errors.INVALID_PARAMETERS;

        if (err.isBoom) {
          switch (err.output.payload.statusCode) {
          case 400:
            errno = errors.INVALID_REQUEST_SIG;
            break;
          case 401:
            errno = errors.INVALID_AUTH_TOKEN;
            break;
          default:
            errno = errors.INVALID_PARAMETERS;
          }
        }

        sendError(res, 401, errno,
                  err.output.payload.message);
        return;
      }

      req.hawkHmacId = hmac(req.hawk.id, conf.get("hawkIdSecret"));
      req.hawk.key = credentials.key;


      /* Make sure we don't decorate the writeHead more than one time. */
      if (res._hawkEnabled) {
        next();
        return;
      }

      var writeHead = res.writeHead;
      res._hawkEnabled = true;
      res.writeHead = function hawkWriteHead() {
        var header = Hawk.server.header(
          credentials, artifacts, {
            payload: res.body,
            contentType: res.get('Content-Type')
          });
        res.setHeader("Server-Authorization", header);
        writeHead.apply(res, arguments);
      };
      next();
    });
}

/**
 * Enable CORS for all requests.
 **/
app.all("*", corsEnabled);

/**
 * Checks that the service and its dependencies are healthy.
 **/
app.get("/__heartbeat__", function(req, res) {
  storage.ping(function(storageStatus) {
    var status;
    if (storageStatus === true) {
      status = 200;
    } else {
      status = 503;
    }

    res.json(status, {
      storage: storageStatus
    });
  });
});

/**
 * Displays some version information at the root of the service.
 **/
app.get("/", function(req, res) {
  var serverInfo = {
    name: pjson.name,
    description: pjson.description,
    version: pjson.version,
    homepage: pjson.homepage,
    endpoint: req.protocol + "://" + req.get("host")
  };

  if (!conf.get("displayVersion")) {
    delete serverInfo.version;
  }
  res.json(200, serverInfo);
});

/**
 * Return the best verification method wrt msisdn, mcc, mnc, roaming
 **/
app.post("/discover", function(req, res) {
  var verificationMethods = [],
      verificationDetails = {},
      url, mcc, mnc;

  if (!req.body.hasOwnProperty("mcc") || req.body.mcc.length !== 3) {
    sendError(res, 400,
              errors.INVALID_PARAMETERS, "Invalid MCC.");
    return;
  }

  mcc = req.body.mcc;

  if (req.body.hasOwnProperty("mnc") && req.body.mnc.length === 3) {
    mnc = req.body.mnc;
  }

  if (req.body.hasOwnProperty("msisdn")) {
    var msisdn = phone(req.body.msisdn);
    if (msisdn === null) {
      sendError(res, 400,
                errors.INVALID_PARAMETERS, "Invalid MSISDN number.");
      return;
    }
    // SMS/MT methods configuration
    url = req.protocol + "://" + req.get("host") +
          conf.get("apiPrefix") + "/sms/mt/verify";

    verificationMethods.push("sms/mt");
    verificationDetails["sms/mt"] = {
      mtSender: conf.get("mtSender"),
      url: url
    };
  }

  // SMS/MOMT methods configuration
  verificationMethods.push("sms/momt");
  verificationDetails["sms/momt"] = {
    mtSender: conf.get("mtSender"),
    moVerifier: smsGateway.getMoVerifierFor(mcc, mnc)
  };

  res.json(200, {
    verificationMethods: verificationMethods,
    verificationDetails: verificationDetails
  });
});

/**
 * Ask for a new number registration.
 **/
app.post("/register", function(req, res) {

  var token = new Token();
  token.getCredentials(function(tokenId, authKey, sessionToken) {
    var hawkHmacId = hmac(tokenId, conf.get("hawkIdSecret"));
    storage.setSession(hawkHmacId, authKey, function(err) {
      if (err) {
        logError(err);
        sendError(res, 503, errors.BACKEND, "Service Unavailable");
        return;
      }

      res.json(200, {
        msisdnSessionToken: sessionToken
      });
    });
  });
});

/**
 * Unregister the session.
 **/
app.post("/unregister", hawkMiddleware, function(req, res) {
  storage.cleanSession(req.hawkHmacId, function(err) {
    if (err) {
      logError(err);
      sendError(res, 503, errors.BACKEND, "Service Unavailable");
      return;
    }
    res.json(200, {});
  });
});

/**
 * Ask for a new number registration.
 **/
app.post("/sms/mt/verify", hawkMiddleware, requireParams("msisdn"),
  validateMSISDN, function(req, res) {
    var code, message;
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
      var storedMsisdn = encrypt.decrypt(req.hawk.id, cipherMsisdn);

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
          // XXX export string in l10n external file.
          smsGateway.sendSMS(req.msisdn, message, function(err, data) {
            res.json(200, {});
          });
        });
      });
    });
  });


/**
 * Handle Mobile Originated SMS reception
 **/
app.get("/sms/momt/nexmo_callback", function(req, res) {
  if (!req.query.hasOwnProperty("msisdn")) {
    // New number setup should answer 200
    res.json(200, {});
    return;
  }

  var msisdn = phone('+' + req.query.msisdn);
  var text = req.query.text.split(" ");
  if (text.length !== 2) {
    logError(text + " is not in the right format.");
    res.json(200, {});
    return;
  }
  var hawkId = text[1];
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

      var storedMsisdn = encrypt.decrypt(hawkId, cipherMsisdn);

      if (storedMsisdn !== null && storedMsisdn !== msisdn) {
        logError(
          new Error("Attempt to very several MSISDN per session.", {
            sessionId: hawkHmacId,
            previousMsisdn: storedMsisdn,
            currentMsisdn: msisdn
          })
        );

        res.json(200, {});
        return;
      }

      if (cipherMsisdn === null) {
        cipherMsisdn = encrypt.encrypt(hawkId, msisdn);
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
          smsGateway.sendSMS(msisdn, code, function(err) {
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

            var msisdn = encrypt.decrypt(req.hawk.id, cipherMsisdn);
            res.json(200, {msisdn: msisdn});
          });
        });
      });
    });
  });


/**
 * Generate certificate
 **/
app.post("/certificate/sign", hawkMiddleware, requireParams(
  "duration", "publicKey"), function(req, res) {
    var publicKey;
    try {
      publicKey = JSON.parse(req.body.publicKey);
    } catch (err) {
      sendError(res, 400, errors.BADJSON, err);
      return;
    }
    var duration = req.body.duration;

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
      var now = Date.now();
      var md5sum = crypto.createHash("md5");
      md5sum.update(msisdn);
      var msisdn_uuid = uuid.unparse(md5sum.digest());

      jwcrypto.cert.sign({
        publicKey: jwcrypto.loadPublicKeyFromObject(publicKey),
        principal: msisdn_uuid + "@" + req.get("host")
      }, {
        issuer: req.get("host"),
        // Set issuedAt to 10 seconds ago. Pads for verifier clock skew
        issuedAt: new Date(now - (10 * 1000)),
        expiresAt: new Date(now + duration)
      }, {
        "lastAuthAt": now,
        "verifiedMSISDN": msisdn
      }, _privKey, function(err, cert) {
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

/***********************
 * BrowserId IdP views *
 ***********************/

/**
 * Well known BrowserId
 */
app.get("/.well-known/browserid", function(req, res) {
  res.json(200, {
    "public-key": _publicKey.serialize(),
    "authentication": "/.well-known/browserid/warning.html",
    "provisioning": "/.well-known/browserid/warning.html"
  });
});

app.get("/.well-known/browserid/warning.html", function(req, res) {
  res.sendfile(__dirname + "/templates/idp-warning.html");
});



app.listen(conf.get("port"), conf.get("host"), function(){
  console.log("Server listening on http://" +
              conf.get("host") + ":" + conf.get("port"));
});

module.exports = {
  app: app,
  conf: conf,
  storage: storage,
  requireParams: requireParams
};
