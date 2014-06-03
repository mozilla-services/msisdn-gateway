/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var redis = require("redis");

var ONE_DAY_SEC = 24 * 3600;  // A day in seconds

var CODE_KEY_PREFIX = "msisdn_code_";
var MSISDN_KEY_PREFIX = "msisdn_sms_";
var SESSION_KEY_PREFIX = "msisdn_session_";
var VALIDATED_KEY_PREFIX = "code_validated_";

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
  setCode: function(hawkHmacId, code, callback) {
    var key = CODE_KEY_PREFIX + hawkHmacId;
    this._client.setex(key, ONE_DAY_SEC, code, callback);
  },

  verifyCode: function(hawkHmacId, code, callback) {
    var key = CODE_KEY_PREFIX + hawkHmacId;
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

  storeMSISDN: function(hawkHmacId, msisdn, callback) {
    var key = MSISDN_KEY_PREFIX + hawkHmacId;
    this._client.setex(key, ONE_DAY_SEC, msisdn, callback);
  },

  getMSISDN: function(hawkHmacId, callback) {
    var key = MSISDN_KEY_PREFIX + hawkHmacId;
    this._client.get(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, result);
    });
  },

  setValidation: function(hawkHmacId, msisdn, callback) {
    var key = VALIDATED_KEY_PREFIX + hawkHmacId;
    this._client.setex(key, ONE_DAY_SEC, msisdn, callback);
  },

  getValidation: function(hawkHmacId, callback) {
    var key = VALIDATED_KEY_PREFIX + hawkHmacId;
    this._client.get(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, result);
    });
  },

  setSession: function(hawkHmacId, authKey, callback) {
    var key = SESSION_KEY_PREFIX + hawkHmacId;
    this._client.set(key, authKey, callback);
  },

  getSession: function(hawkHmacId, callback) {
    var key = SESSION_KEY_PREFIX + hawkHmacId;
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

  cleanSession: function(hawkHmacId, callback) {
    var self = this;
    var sessionKey = SESSION_KEY_PREFIX + hawkHmacId;
    var msisdnKey = MSISDN_KEY_PREFIX + hawkHmacId;
    var codeKey = CODE_KEY_PREFIX + hawkHmacId;
    self._client.del(sessionKey, function(err) {
      if (err) {
        callback(err);
        return;
      }
      self._client.del(msisdnKey, function(err) {
        if (err) {
          callback(err);
          return;
        }
        self._client.del(codeKey, function(err) {
          callback(err);
        });
      });
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
