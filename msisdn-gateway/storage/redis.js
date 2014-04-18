/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var redis = require("redis");

var ONE_DAY_SEC = 24 * 3600;  // A day in seconds

function RedisStorage(options, settings) {
  this._settings = settings;
  this._client = redis.createClient(
    options.host,
    options.port,
    options.options
  );
  if (options.db) {
    this._client.select(options.db);
  }
}

RedisStorage.prototype = {
  setCode: function(msisdnMac, code, callback) {
    var key = 'msisdn_code_' + msisdnMac;
    this._client.setex(key, ONE_DAY_SEC, code, callback);
  },

  verifyCode: function(msisdnMac, code, callback) {
    var key = 'msisdn_code_' + msisdnMac;
    this._client.get(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      if (result === null) {
        callback(null, null);
        return;
      }

      if (result === code) {
        callback(null, true);
        return;
      }
      callback(null, false);
    });
  },

  drop: function(callback) {
    this._client.flushdb(callback);
  },

  ping: function(callback) {
    this._client.ping(function(err, value) {
      callback((err === null && value === "PONG"));
    });
  }
};

module.exports = RedisStorage;
