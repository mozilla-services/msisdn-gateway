/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var convict = require('convict');
var format = require('util').format;
var crypto = require('crypto');
var validateJWCryptoKey = require("./utils").validateJWCryptoKey;

/**
 * Validates the keys are present in the configuration object.
 *
 * @param {List} keys  A list of keys that must be present.
 **/
function validateKeys(keys, empty) {
  if (empty === undefined) {
    empty = false;
  }

  return function(val) {
    if (!val) {
      if (!empty) {
        throw new Error("Should be defined");
      }
      return;
    }
    keys.forEach(function(key) {
      if (!val.hasOwnProperty(key))
        throw new Error(format("Should have a %s property", key));
    });
  };
}

/**
 * Build a validator that makes sure of the size and hex format of a key.
 *
 * @param {Integer}   size  Number of bytes of the key.
 * @return {Function} Validator
 **/
function hexKeyOfSize(size) {
  return function check(val) {
    if (!new RegExp(format('^[a-fA-FA0-9]{%d}$', size * 2)).test(val)) {
      throw new Error(format("Should be an %d bytes key encoded as " + 
                             "hexadecimal", size));
    }
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
  apiPrefix: {
    doc: "The API Prefix i.e: `/v1/msisdn` (no trailing slash)",
    format: String,
    default: "",
    env: "API_PREFIX"
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
  },
  msisdnIdSecret: {
    doc: "The secret for hmac-ing msisdnId (16 bytes key encoded as hex)",
    format: hexKeyOfSize(16),
    default: "",
    env: "MSISDN_ID_SECRET"
  },
  msisdnMacSecret: {
    doc: "The secret for hmac-ing msisdnMac (16 bytes key encoded as hex)",
    format: hexKeyOfSize(16),
    default: "",
    env: "MSISDN_MAC_SECRET"
  },
  msisdnMacAlgorithm: {
    doc: "The algorithm that should be used to mac msisdn",
    format: function(val) {
      if (crypto.getHashes().indexOf(val) === -1) {
        throw new Error("Given hmac algorithm is not supported");
      }
    },
    default: "sha256",
    env: "MSISDN_MAC_ALGORITHM"
  },
  BIDPublicKey: {
    doc: "The Browser ID Public Key",
    format: validateJWCryptoKey
  },
  BIDSecretKey: {
    doc: "The Browser ID Private Key",
    format: validateJWCryptoKey
  },
  leonixCredentials: {
    format: validateKeys(["endpoint", "service", "login",
                          "pwd", "source"], true),
    default: ""
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
  hexKeyOfSize: hexKeyOfSize,
  validateKeys: validateKeys
};
