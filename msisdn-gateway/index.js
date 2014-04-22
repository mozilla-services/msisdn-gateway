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
var phone = require("phone");
var hmac = require("./hmac");
var digitsCode = require("./utils").digitsCode;
var smsGateway = require("./sms-gateway");

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
  var credentials = {
    name: pjson.name,
    description: pjson.description,
    version: pjson.version,
    homepage: pjson.homepage,
    endpoint: req.protocol + "://" + req.get("host")
  };

  if (!conf.get("displayVersion")) {
    delete credentials.version;
  }
  res.json(200, credentials);
});

/**
 * Ask for a new number registration
 **/
app.post("/register", requireParams("msisdn"), function(req, res) {
  var msisdn = phone(req.body.msisdn);

  if (msisdn === null) {
    res.sendError("body", "msisdn", "Invalid MSISDN number.");
    return;
  }
  var msisdnId = hmac(msisdn, conf.get('msisdnIdSecret'));
  var msisdnMac = hmac(msisdn, conf.get("msisdnMacSecret"));
  var code = digitsCode(6);

  storage.setCode(msisdnId, code, function(err) {
    if (err) {
      logError(err);
      res.json(503, "Service Unavailable");
      return;
    }
    /* Send SMS */
    smsGateway.sendSMS(msisdn,
      "To validate your number please enter the following code: " + code,
      function(err) {
        var hawkCredentials = {
          id: msisdnId, key: msisdnMac,
          algorithm: conf.get('msisdnMacAlgorithm')
        };
        res.json(hawkCredentials);
      });
  });
});

/**
 * Ask for a new number code verification
 **/
app.post("/verify_code", requireParams("msisdn", "code"), function(req, res) {
  var msisdn = phone(req.body.msisdn);

  if (msisdn === null) {
    res.sendError("body", "msisdn", "Invalid MSISDN number.");
    return;
  }

  var msisdnId = hmac(msisdn, conf.get("msisdnIdSecret"));
  var code = req.body.code;
  storage.verifyCode(msisdnId, code, function(err, result) {
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

    res.json(200, {cert: "Here is your certificate."});
  });
});

/**
 * Ask for a new verification code
 **/
app.post("/resend_code", requireParams("msisdn"), function(req, res) {
  var msisdn = phone(req.body.msisdn);

  if (msisdn === null) {
    res.sendError("body", "msisdn", "Invalid MSISDN number.");
    return;
  }

  var msisdnId = hmac(msisdn, conf.get("msisdnIdSecret"));
  var code = digitsCode(6);

  storage.setCode(msisdnId, code, function(err) {
    if (err) {
      logError(err);
      res.json(503, "Service Unavailable");
      return;
    }
    /* Send SMS */
    smsGateway.sendSMS(msisdn,
      "To validate your number please enter the following code: " + code,
      function(err) {
        res.json({});
      });
  });
});

/**
 * Unregister the session
 **/
app.post("/unregister", requireParams("msisdn"), function(req, res) {
  var msisdn = phone(req.body.msisdn);

  if (msisdn === null) {
    res.sendError("body", "msisdn", "Invalid MSISDN number.");
    return;
  }

  var msisdnId = hmac(msisdn, conf.get("msisdnIdSecret"));

  storage.cleanSession(msisdnId, function(err) {
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
