/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var redis = require("redis");

var ONE_DAY_SEC = 24 * 3600;  // A day in seconds

var CODE_KEY_PREFIX = "msisdn_code_";
var SMS_CODE_KEY_PREFIX = "msisdn_sms_";
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

  setSmsCode: function(smsBody, code, callback) {
    var key = SMS_CODE_KEY_PREFIX + smsBody;
    this._client.setex(key, ONE_DAY_SEC, code, callback);
  },

  popSmsCode: function(smsBody, callback) {
    var self = this;
    var key = SMS_CODE_KEY_PREFIX + smsBody;
    this._client.get(key, function(err, code) {
      if (err) {
        callback(err);
        return;
      }
      self._client.del(key, function(err) {
        callback(err, code);
      });
    });
  },

  setSession: function(tokenId, authKey, callback) {
    var key = SESSION_KEY_PREFIX + tokenId
    this._client.set(key, authKey, callback);
  },

  getSession: function(tokenId, callback) {
    var key = SESSION_KEY_PREFIX + tokenId;
    this._client.get(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      if (result === null) {
        callback(null, null);
        return;
      }

      callback(null, {
        key: result,
        algorithm: "sha256"
      });
    });
  },

  cleanSession: function(tokenId, callback) {
    var sessionKey = SESSION_KEY_PREFIX + tokenId;
    this._client.del(sessionKey, callback);
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
