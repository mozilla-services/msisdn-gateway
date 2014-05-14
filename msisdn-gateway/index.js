/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var express = require("express");
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
var validateMSISDN = require("./middleware").validateMSISDN;
var Token = require("./token").Token;
var validateJWCryptoKey = require("./utils").validateJWCryptoKey;
var Hawk = require('hawk');

var jwcrypto = require('jwcrypto');

// Make sure to load supported algorithms.
require('jwcrypto/lib/algs/rs');
require('jwcrypto/lib/algs/ds');

var _publicKey = jwcrypto.loadPublicKeyFromObject(conf.get('BIDPublicKey'));
var _privKey = jwcrypto.loadSecretKeyFromObject(conf.get('BIDSecretKey'));

var ravenClient = new raven.Client(conf.get("sentryDSN"));

var getStorage = require("./storage");
var storage = getStorage(conf.get("storage"));

var DIGIT_CODE_SIZE = 6;

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
    client.getSession(id, callback);
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

      /* Make sure we check for hawk only once */
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
 * Ask for a new number registration.
 **/
app.post("/register", requireParams("msisdn"), function(req, res) {

  if (req.body.hasOwnProperty("msisdn")) {
    var msisdn = phone(req.body.msisdn);
    if (msisdn === null) {
      res.sendError("body", "msisdn", "Invalid MSISDN number.");
      return;
    }
  }

  var token = new Token();
  token.getCredentials(function(tokenId, authKey, sessionToken) {
    storage.setSession(tokenId, authKey, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }

      res.json(200, {
        msisdnSessionToken: sessionToken,
        verificationUrl: req.protocol + "://" + req.get("host") +
          conf.get("apiPrefix") + "/sms/mt/verify"
      });
    });
  });
});

/**
 * Unregister the session.
 **/
app.post("/unregister", hawkMiddleware, requireParams("msisdn"),
  validateMSISDN, function(req, res) {
    storage.cleanSession(req.hawk.id, function(err) {
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
    var code = digitsCode(DIGIT_CODE_SIZE);

    storage.setCode(req.msisdnId, code, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }
      /* Send SMS */
      // XXX export string in l10n external file.
      smsGateway.sendSMS(req.msisdn,
        "To validate your number please enter the following code: " + code +
        " ",
        function(err, data) {
          res.json(200, data);
        });
    });
  });


/**
 * Ask for a new number code verification.
 **/
app.post("/sms/verify_code", hawkMiddleware, requireParams(
  "msisdn", "code", "duration", "publicKey"), validateMSISDN,
  function(req, res) {
    var code = req.body.code;
    var publicKey = req.body.publicKey;
    var duration = req.body.duration;

    // Validate code.
    if (code.length !== DIGIT_CODE_SIZE) {
      res.addError("body", "code",
                   "Code should be " + DIGIT_CODE_SIZE + " long.");
    }

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

    storage.verifyCode(req.msisdnId, code,
      function(err, result, verifierSetAt) {
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
          res.json(403, "Code error.");
          return;
        }

        // XXX Need to generate a certificate.
        var now = Date.now();

        jwcrypto.cert.sign({
          publicKey: jwcrypto.loadPublicKeyFromObject(publicKey),
          principal: req.msisdnId + "@" + req.get("host")
        }, {
          issuer: req.get("host"),
          // Set issuedAt to 10 seconds ago. Pads for verifier clock skew.
          issuedAt: new Date(now - (10 * 1000)),
          expiresAt: new Date(now + duration)
        }, {
          "fxa-lastAuthAt": now,
          "fxa-verifiedMSISDN": req.msisdn
        }, _privKey,
        function(err, cert) {
          if (err) {
            logError(err);
            res.json(503, "Service Unavailable");
            return;
          }
          res.json(200, {cert: cert, publicKey: _publicKey.serialize()});
        });
      });
  });

/**
 * Ask for a new verification code.
 **/
app.post("/sms/mt/resend_code", hawkMiddleware, requireParams("msisdn"),
  validateMSISDN, function(req, res) {
    var code = digitsCode(DIGIT_CODE_SIZE);

    storage.setCode(req.msisdnId, code, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }
      /* Send SMS */
      smsGateway.sendSMS(req.msisdn,
        "To validate your number please enter the following code: " + code,
        function(err) {
          res.json(200, {});
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
