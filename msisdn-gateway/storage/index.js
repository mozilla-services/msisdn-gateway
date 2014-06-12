/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function getStorage(conf, options) {
  var engine = conf.engine || 'redis';
  var settings = conf.settings || {};

  var Storage = require('./' + engine + '.js');
  return new Storage(settings, options);
}

function ProxyStorage(storageConf, longTermStorageConf, options) {
  var storageMethods = ["setCode", "verifyCode",
                        "setCodeWrongTry", "expireCode",
                        "storeMSISDN", "getMSISDN",
                        "setValidation", "getValidation",
                        "setSession", "getSession",
                        "cleanSession", "drop", "ping"];

  var longTermStorageMethods = ["setCertificateData", "getCertificateData",
                                "cleanSession", "drop", "ping"];

  var storage = getStorage(storageConf, options);
  var longTermStorage = getStorage(longTermStorageConf, options);

  var self = this;

  storageMethods.forEach(function(method) {
    if (typeof storage[method] !== "function") {
      var type = storage.constructor.name;
      throw new Error(type + " need a " + method +
                      " to be used as temporary storage.");
    }
    self[method] = storage[method].bind(storage);
  });

  longTermStorageMethods.forEach(function(method) {
    if (typeof longTermStorage[method] !== "function") {
      var type = typeof storage;
      throw new Error(type + " need a " + method +
                      " to be used as long term storage.");
    }
    self[method] = longTermStorage[method].bind(longTermStorage);
  });

  this.drop = function(callback) {
    storage.drop(function(err) {
      if (err) {
        callback(err);
        return;
      }
      longTermStorage.drop(callback);
    });
  };

  this.ping = function(callback) {
    storage.ping(function(err) {
      if (err) {
        callback(err);
        return;
      }
      longTermStorage.ping(callback);
    });
  };

  this.cleanSession = function(hawkHmacId, callback) {
    storage.cleanSession(hawkHmacId, function(err) {
      if (err) {
        callback(err);
        return;
      }
      longTermStorage.cleanSession(hawkHmacId, callback);
    });
  };
}

module.exports = ProxyStorage;
