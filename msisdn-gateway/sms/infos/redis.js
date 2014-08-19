/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var redis = require("redis");

function RedisMap(options) {
  this._client = redis.createClient(
    options.port,
    options.host,
    options.options
  );
  if (options.db) {
    this._client.select(options.db);
  }
  this.mtModelName = options.mtSenderModelName;
  this.defaultMtSender = options.mtSender || null;
  this.moModelName = options.moVerifierModelName;
  this.defaultMoVerifier = options.moVerifier || null;
}

RedisMap.prototype = {
  /**
   * Get the mtSender number with regards to MCC/MNC
   */
  getMtSenderFor: function getMtSenderFor(mcc, mnc, callback) {
    var self = this;
    if (mnc === undefined) mnc = "";

    self._client.smembers("modelrecords." + self.mtModelName,
      function(err, keys) {
        if (err) {
          callback(err);
          return;
        }
        console.log("mtKeys", keys);
        if (keys !== null) {
          keys.push(function(err, records) {
            if (err) {
              callback(err);
              return;
            }
            records = records.map(JSON.parse).map(function(record) {
              return record.record;
            }).filter(function(record) {
              return record.mcc === mcc && record.mnc === mnc;
            });
            console.log(records);

            if(records.length > 0) {
              callback(null, records[0].number);
            } else {
              callback(null, self.defaultMtSender);
            }
          });
          self._client.mget.apply(self._client, keys);
        } else {
          callback(null, self.defaultMtSender);
        }
      });
  },

  /**
   * Get the moVerifier number with regards to MCC/MNC
   */
  getMoVerifierFor: function getMoVerifierFor(mcc, mnc, callback) {
    var self = this;
    if (mnc === undefined) mnc = "";

    self._client.smembers("modelrecords." + self.moModelName,
      function(err, keys) {
        if (err) {
          callback(err);
          return;
        }
        console.log(keys);

        if (keys !== null) {
          keys.push(function(err, records) {
            if (err) {
              callback(err);
              return;
            }
            records = records.map(JSON.parse).map(function(record) {
              return record.record;
            }).filter(function(record) {
              return record.mcc === mcc && record.mnc === mnc;
            });

            if(records.length > 0) {
              callback(null, records[0].number);
            } else {
              callback(null, self.defaultMoVerifier);
            }
          });
          self._client.mget.apply(self._client, keys);
        } else {
          callback(null, self.defaultMoVerifier);
        }
      });
  }
};

module.exports = RedisMap;
