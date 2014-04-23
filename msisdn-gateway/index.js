/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var express = require("express");
var conf = require("./config").conf;
var pjson = require("../package.json");
var raven = require("raven");
var cors = require("cors");
var errors = require("connect-validation");
var logging = require("express-logging");
var headers = require("./headers");
var digitsCode = require("./utils").digitsCode;
var smsGateway = require("./sms-gateway");
var validateMSISDN = require("./middleware").validateMSISDN;
var Token = require("./token").Token;

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
 * Ask for a new number registration
 **/
app.post("/register", requireParams("msisdn"), validateMSISDN,
  function(req, res) {
    var code = digitsCode(6);

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
          var token = new Token();
          token.getCredentials(function(tokenId, sessionToken) {
            storage.setSession(tokenId, sessionToken, function(err) {
              if (err) {
                logError(err);
                res.json(503, "Service Unavailable");
                return;
              }

              res.json(200, {msisdnSessionToken: sessionToken});
            });
          });
        });
    });
  });

/**
 * Ask for a new number code verification
 **/
app.post("/verify_code", requireParams("msisdn", "code"), validateMSISDN,
  function(req, res) {
    var code = req.body.code;
    storage.verifyCode(req.msisdnId, code, function(err, result) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }

      if (result === null) {
        res.json(404, "Registration not found.");
        return;
      }

      if (!result) {
        res.json(403, "Code error.");
        return;
      }

      // XXX Need to generate a certificate
      res.json(200, {cert: "Here is your certificate."});
    });
  });

/**
 * Ask for a new verification code
 **/
app.post("/resend_code", requireParams("msisdn"), validateMSISDN,
  function(req, res) {
    var code = digitsCode(6);

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

/**
 * Unregister the session
 **/
app.post("/unregister", requireParams("msisdn"), validateMSISDN,
  function(req, res) {
    storage.cleanSession(req.msisdnId, function(err) {
      if (err) {
        logError(err);
        res.json(503, "Service Unavailable");
        return;
      }
      res.json(200, {});
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
