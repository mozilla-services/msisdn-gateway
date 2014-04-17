/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var express = require('express');
var conf = require('./config').conf;
var pjson = require('../package.json');
var request = require('request');
var raven = require('raven');
var cors = require('cors');
var errors = require('connect-validation');
var logging = require('./logging');
var headers = require('./headers');

var ravenClient = new raven.Client(conf.get('sentryDSN'));

var getStorage = require('./storage');
var storage = getStorage(conf.get("storage"));

function logError(err) {
  console.log(err);
  ravenClient.captureError(err);
}

var app = express();

if (conf.get("env") === "development") {
  app.use(logging);
}
app.use(headers);
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded());
app.use(errors);
app.use(app.router);
// Exception logging should come at the end of the list of middlewares.
app.use(raven.middleware.express(conf.get('sentryDSN')));

var corsEnabled = cors({
  origin: function(origin, callback) {
    var acceptedOrigin = conf.get('allowedOrigins').indexOf(origin) !== -1;
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
      res.json(406, ['application/json']);
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
app.all('*', corsEnabled);

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
    endpoint: req.protocol + "://" + req.get('host')
  };

  if (!conf.get("displayVersion")) {
    delete credentials.version;
  }
  res.json(200, credentials);
});

app.listen(conf.get('port'), conf.get('host'), function(){
  console.log('Server listening on http://' +
              conf.get('host') + ':' + conf.get('port'));
});

module.exports = {
  app: app,
  conf: conf,
  storage: storage,
  requireParams: requireParams,
  request: request
};
