/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var redis = require("redis");

var ONE_DAY_SEC = 24 * 3600;  // A day in seconds

var CODE_KEY_PREFIX = "msisdn_code_";
var CODE_COUNTER_PREFIX = "code_count_";
var MSISDN_KEY_PREFIX = "msisdn_sms_";
var MSISDN_MTSENDER_PREFIX = "msisdn_sms_";
var SESSION_KEY_PREFIX = "msisdn_session_";
var CERTIFICATE_KEY_PREFIX = "msisdn_certificate_";

function RedisStorage(options, settings) {
  this._settings = settings;
  this._client = redis.createClient(
    options.port,
    options.host,
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

  setCodeWrongTry: function(hawkHmacId, callback) {
    var key = CODE_COUNTER_PREFIX + hawkHmacId;
    this._client.incr(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, result);
    });
  },

  expireCode: function(hawkHmacId, callback) {
    var self = this;
    var counterKey = CODE_COUNTER_PREFIX + hawkHmacId;
    var codeKey = CODE_KEY_PREFIX + hawkHmacId;
    this._client.del(counterKey, function(err) {
      if (err) {
        callback(err);
        return;
      }
      self._client.del(codeKey, function(err) {
        if (err) {
          callback(err);
          return;
        }
        callback(null);
      });
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

  setMtSender: function(hawkHmacId, mtSender, callback) {
    var key = MSISDN_MTSENDER_PREFIX + hawkHmacId;
    this._client.setex(key, ONE_DAY_SEC, mtSender, callback);
  },

  getMtSender: function(hawkHmacId, callback) {
    var key = MSISDN_MTSENDER_PREFIX + hawkHmacId;
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
    this._client.setex(key, this._settings.hawkSessionDuration,
                       authKey, callback);
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

  setCertificateData: function(hawkHmacId, data, callback) {
    var key = CERTIFICATE_KEY_PREFIX + hawkHmacId;
    this._client.set(key, JSON.stringify(data), callback);
  },

  getCertificateData: function(hawkHmacId, callback) {
    var key = CERTIFICATE_KEY_PREFIX + hawkHmacId;
    this._client.get(key, function(err, result) {
      if (err) {
        callback(err);
        return;
      }

      if (result === null) {
        callback(null, null);
        return;
      }

      callback(null, JSON.parse(result));
    });
  },

  cleanSession: function(hawkHmacId, callback) {
    var self = this;
    var sessionKey = SESSION_KEY_PREFIX + hawkHmacId;
    var certificateKey = CERTIFICATE_KEY_PREFIX + hawkHmacId;
    var msisdnKey = MSISDN_KEY_PREFIX + hawkHmacId;
    var mtSenderKey = MSISDN_MTSENDER_PREFIX + hawkHmacId;
    var codeKey = CODE_KEY_PREFIX + hawkHmacId;
    var counterKey = CODE_COUNTER_PREFIX + hawkHmacId;

    self._client.del(sessionKey, function(err) {
      if (err) {
        callback(err);
        return;
      }
      self._client.del(certificateKey, function(err) {
        if (err) {
          callback(err);
          return;
        }
        self._client.del(msisdnKey, function(err) {
          if (err) {
            callback(err);
            return;
          }
          self._client.del(mtSenderKey, function(err) {
            if (err) {
              callback(err);
              return;
            }
            self._client.del(codeKey, function(err) {
              if (err) {
                callback(err);
                return;
              }
              self._client.del(counterKey, function(err) {
                callback(err);
              });
            });
          });
        });
      });
    });
  },

  cleanVolatileData: function(hawkHmacId, callback) {
    var self = this;
    var sessionKey = SESSION_KEY_PREFIX + hawkHmacId;
    var msisdnKey = MSISDN_KEY_PREFIX + hawkHmacId;
    var mtSenderKey = MSISDN_MTSENDER_PREFIX + hawkHmacId;
    var codeKey = CODE_KEY_PREFIX + hawkHmacId;
    var counterKey = CODE_COUNTER_PREFIX + hawkHmacId;

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
        self._client.del(mtSenderKey, function(err) {
          if (err) {
            callback(err);
            return;
          }
          self._client.del(codeKey, function(err) {
            if (err) {
              callback(err);
              return;
            }
            self._client.del(counterKey, function(err) {
              callback(err);
            });
          });
        })
      });
    });
  },

  drop: function(callback) {
    this._client.flushdb(callback);
  },

  setup: function(callback) {
    // Redis setup don't need anything.
    callback(null);
  },

  ping: function(callback) {
    this._client.ping(function(err, value) {
      callback((err === null && value === "PONG"));
    });
  }
};

module.exports = RedisStorage;
