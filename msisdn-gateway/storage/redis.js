/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var redis = require("redis");

var ONE_DAY_SEC = 24 * 3600;  // A day in seconds

var CODE_KEY_PREFIX = "msisdn_code_";
var SESSION_KEY_PREFIX = "msisdn_session_";

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
  setCode: function(msisdnId, code, callback) {
    var key = CODE_KEY_PREFIX + msisdnId;
    this._client.setex(key, ONE_DAY_SEC, code, callback);
  },

  verifyCode: function(msisdnId, code, callback) {
    var key = CODE_KEY_PREFIX + msisdnId;
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

  setSession: function(msisdnId, msisdnMac, callback) {
    var key = SESSION_KEY_PREFIX + msisdnId
    this._client.set(key, msisdnMac, callback);
  },

  verifySession: function(msisdnId, msisdnMac, callback) {
    var key = SESSION_KEY_PREFIX + msisdnId
    this._client.get(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      if (result === null) {
        callback(null, null);
        return;
      }

      if (result === msisdnMac) {
        callback(null, true);
        return;
      }
      callback(null, false);
    });
  },

  cleanSession: function(msisdnId, callback) {
    var codeKey = CODE_KEY_PREFIX + msisdnId;
    var sessionKey = SESSION_KEY_PREFIX + msisdnId;
    this._client.del(codeKey, sessionKey, callback);
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
