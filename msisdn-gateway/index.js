/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var express = require("express");
var conf = require("./config").conf;
var raven = require("raven");
var cors = require("cors");
var logging = require("express-logging");
var headers = require("./headers");
var checkHeaders = require("./middleware").checkHeaders;
var handle404 = require("./middleware").handle404;
var applyErrorLogging = require("./middleware").applyErrorLogging;
var i18n = require('./i18n')(conf.get('i18n'));

// Configure http and https globalAgent
var http = require('http');
var https = require('https');
https.globalAgent.maxSockets = conf.get('maxHTTPSockets');
http.globalAgent.maxSockets = conf.get('maxHTTPSockets');

var ravenClient = new raven.Client(conf.get("sentryDSN"));

var getStorage = require("./storage");
var storage = getStorage(conf.get("storage"), {
  hawkSessionDuration: conf.get("hawkSessionDuration")
});

function logError(err) {
  console.error(err);
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

var hawkMiddleware = require('./hawk')(storage);

var corsEnabled = cors({
  origin: function(origin, callback) {
    var allowedOrigins = conf.get('allowedOrigins');
    var acceptedOrigin = allowedOrigins.indexOf('*') !== -1 ||
                         allowedOrigins.indexOf(origin) !== -1;
    callback(null, acceptedOrigin);
  },
  credentials: true
});

/**
 * Enable CORS for all requests.
 **/
app.all("*", corsEnabled);

var home = require("./routes/home");
home(app, conf, logError, storage);

var registration = require("./routes/registration");
registration(app, conf, logError, storage, hawkMiddleware);

var discover = require("./routes/discover");
discover(app, conf, logError);

var sms = require("./routes/sms");
sms(app, conf, logError, storage, hawkMiddleware);

var certificate = require("./routes/certificate");
certificate(app, conf, logError, storage, hawkMiddleware);

var browserid = require("./routes/browser-id");
browserid(app, conf);

var videur = require("./routes/videur");
videur(app, conf);


var argv = require('yargs').argv;
var server = http.createServer(app);

if (argv.hasOwnProperty("fd")) {
  var fd = parseInt(argv.fd, 10)
  server.listen({fd: fd}, function() {
    console.log("Server listening on fd://" + fd);
  });
} else {
  server.listen(conf.get("port"), conf.get("ip"), function() {
    console.log("Server listening on http://" +
                conf.get("ip") + ":" + conf.get("port"));
  });
}

function shutdown(cb) {
  server.close(function() {
    process.exit(0);
    if (cb !== undefined) {
      cb();
    }
  });
}

process.on('SIGTERM', shutdown);

module.exports = {
  app: app,
  server: server,
  conf: conf,
  storage: storage,
  shutdown: shutdown
};
