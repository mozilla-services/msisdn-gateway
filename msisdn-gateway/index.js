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
var errors = require("connect-validation");
var logging = require("express-logging");
var headers = require("./headers");
var digitsCode = require("./utils").digitsCode;
var smsGateway = require("./sms-gateway");
var hmac = require("./hmac");
var validateMSISDN = require("./middleware").validateMSISDN;
var Token = require("./token").Token;
var validateJWCryptoKey = require("./utils").validateJWCryptoKey;
var Hawk = require('hawk');
var uuid = require('node-uuid');

var jwcrypto = require('jwcrypto');

// Make sure to load supported algorithms.
require('jwcrypto/lib/algs/rs');
require('jwcrypto/lib/algs/ds');

var _publicKey = jwcrypto.loadPublicKeyFromObject(conf.get('BIDPublicKey'));
var _privKey = jwcrypto.loadSecretKeyFromObject(conf.get('BIDSecretKey'));

var ravenClient = new raven.Client(conf.get("sentryDSN"));

var getStorage = require("./storage");
var storage = getStorage(conf.get("storage"));

function logError(err) {
  console.log(err);
  ravenClient.captureError(err);
}

var app = express();

if (conf.get("env") === "development") {
  app.use(logging(conf.get("consoleDateFormat")));
}
app.use(headers);
app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded());
app.use(errors);
app.use(app.router);
// Exception logging should come at the end of the list of middlewares.
app.use(raven.middleware.express(conf.get("sentryDSN")));

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
      missingParams.forEach(function(item) {
        res.addError("body", item, "missing: " + item);
      });
      res.sendError();
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
    var client = getStorage(conf.get("storage"));
    var hawkHmacId = hmac(id, conf.get("hawkIdSecret"));
    client.getSession(hawkHmacId, callback);
  }, {},
    function(err, credentials, artifacts) {
      req.hawk = artifacts;
      if (err) {
        if (!err.isMissing) {
          logError(err, artifacts);
        }

        // In case no supported authentication was specified, challenge the
        // client.

        res.setHeader("WWW-Authenticate",
                      err.output.headers["WWW-Authenticate"]);
        res.json(401, err.output.payload);
        return;
      }

      if (credentials === null) {
        res.json(403, "Forbidden");
        return;
      }

      req.hawkHmacId = hmac(req.hawk.id, conf.get("hawkIdSecret"));

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
      url;

  if (req.body.hasOwnProperty("msisdn")) {
    var msisdn = phone(req.body.msisdn);
    if (msisdn === null) {
      res.sendError("body", "msisdn", "Invalid MSISDN number.");
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
    moVerifier: conf.get("moVerifier")
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
        res.json(503, "Service Unavailable");
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
app.post("/unregister", hawkMiddleware, requireParams("msisdn"),
  validateMSISDN, function(req, res) {
    storage.cleanSession(req.hawkHmacId, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
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
      message = "Your verification code is: " + code;
    }

    storage.storeMSISDN(req.hawkHmacId, req.msisdn, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }

      storage.setCode(req.hawkHmacId, code, function(err) {
        if (err) {
          logError(err);
          res.json(503, "Service Unavailable");
          return;
        }
        /* Send SMS */
        // XXX export string in l10n external file.
        smsGateway.sendSMS(req.msisdn, message,
          function(err, data) {
            res.json(200, {});
          });
      });
    });
  });


/**
 * Handle Mobile Originated SMS reception
 **/
app.get("/sms/momt/nexmo_callback", function(req, res) {
  if (!req.query.hasOwnProperty("msisdn")) {
    res.json(200, {});
    return;
  }

  var msisdn = phone('+' + req.query.msisdn);
  var hawkHmacId = hmac(req.query.text, conf.get("hawkIdSecret"));

  storage.storeMSISDN(hawkHmacId, msisdn, function(err) {
    if (err) {
      logError(err);
      res.json(503, "Service Unavailable");
      return;
    }

    var code = crypto.randomBytes(conf.get("longCodeBytes")).toString("hex");
    storage.setCode(hawkHmacId, code, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }

      /* Send SMS */
      smsGateway.sendSMS(req.msisdn, code, function(err) {
        if (err) {
          logError(err);
          res.json(503, "Service Unavailable");
          return;
        }
        res.json(200, {});
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
      res.sendError("body", "code",
                   "Code should be short (" + conf.get("shortCodeLength") + 
                   " characters) or long (" + conf.get("longCodeBytes") * 2 +
                   " characters).");
      return;
    }

    storage.verifyCode(req.hawkHmacId, code, function(err, result) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }

      if (result === null) {
        res.json(410, "Code has expired.");
        return;
      }

      if (!result) {
        res.json(400, "Code error.");
        return;
      }

	  storage.getMSISDN(req.hawkHmacId, function(err, msisdn) {
        if (err) {
          logError(err);
          res.json(503, "Service Unavailable");
          return;
        }

        if (msisdn === null) {
          res.json(410, "Token has expired.");
          return;
        }

        storage.setValidation(req.hawkHmacId, msisdn, function(err) {
          if (err) {
            logError(err);
            res.json(503, "Service Unavailable");
            return;
          }

          res.json(200, {msisdn: msisdn});
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
      res.addError("body", "publicKey", err);
    }
    var duration = req.body.duration;

    // Validate publicKey.
    try {
      validateJWCryptoKey(publicKey);
    } catch (err) {
      res.addError("body", "publicKey", err);
    }

    // Validate duration.
    if (typeof duration !== "number" || duration < 1) {
      res.addError("body", "duration",
                   "Duration should be a number of seconds.");
    }

    // Return errors found during validation.
    if (res.hasErrors()) {
      res.sendError();
      return;
    }

    storage.getValidation(req.hawkHmacId, function(err, msisdn) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }

      if (msisdn === null) {
        res.json(410, "Validation has expired.");
        return;
      }

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
          res.json(503, "Service Unavailable");
          return;
        }
        res.json(200, {cert: cert, publicKey: _publicKey.serialize()});
      });
    });
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
