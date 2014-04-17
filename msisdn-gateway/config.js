/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var convict = require('convict');
var format = require('util').format;

/**
 * Validates the keys are present in the configuration object.
 *
 * @param {List} keys  A list of keys that must be present.
 **/
function validateKeys(keys) {
  return function(val) {
    if (!val)
      throw new Error("Should be defined");
    keys.forEach(function(key) {
      if (!val.hasOwnProperty(key))
        throw new Error(format("Should have a %s property", key));
    });
  };
}

var conf = convict({
  env: {
    doc: "The applicaton environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV"
  },
  ip: {
    doc: "The IP address to bind.",
    format: "ipaddress",
    default: "127.0.0.1",
    env: "IP_ADDRESS"
  },
  port: {
    doc: "The port to bind.",
    format: "port",
    default: 5000,
    env: "PORT"
  },
  displayVersion: {
    doc: "Display the server version on the homepage.",
    default: true,
    format: Boolean
  },
  storage: {
    doc: "storage config",
    format: validateKeys(["engine", "settings"]),
    default: {engine: "redis", settings: {}}
  },
  sentryDSN: {
    doc: "Sentry DSN",
    format: function(val) {
      if (!(typeof val === "string" || val === false)) {
        throw new Error("should be either a sentryDSN or 'false'");
      }
    },
    default: false,
    env: "SENTRY_DSN"
  },
  allowedOrigins: {
    doc: "Authorized origins for cross-origin requests.",
    format: Array,
    default: ['http://localhost:3000']
  },
  retryAfter: {
    doc: "Seconds to wait for on 503",
    format: Number,
    default: 30
  },
  consoleDateFormat: {
    doc: "Date format of the logging line in development.",
    format: String,
    default: "%y/%b/%d %H:%M:%S"
  }
});


var env = conf.get('env');
try {
  conf.loadFile('./config/' + env + '.json');
} catch (err) {
  console.log("Please create your config/" + env + ".json file.\n" +
              "You can use config/sample.json as an example.\n");
  process.exit(1);
}

conf.validate();

if (conf.get('allowedOrigins') === "") {
  throw "Please defined the list of allowed origins for CORS.";
}
module.exports = {
  conf: conf,
  validateKeys: validateKeys
};
