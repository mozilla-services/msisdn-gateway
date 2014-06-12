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

function StorageProxy(volatileStorageConf, persistentStorageConf, options) {
  var volatileStorageMethods = [
    "setCode", "verifyCode",
    "setCodeWrongTry", "expireCode",
    "storeMSISDN", "getMSISDN",
    "setValidation", "getValidation",
    "setSession", "getSession",
    "cleanSession", "drop", "ping"
  ];

  var persistentStorageMethods = [
    "setCertificateData", "getCertificateData",
    "cleanSession", "drop", "ping"
  ];

  var volatileStorage = getStorage(volatileStorageConf, options);
  var persistentStorage = getStorage(persistentStorageConf, options);

  var self = this;

  function setupMethods(name, storage, methods) {
    methods.forEach(function(method) {
      if (typeof storage[method] !== "function") {
        var type = storage.constructor.name;
        throw new Error(type + " need a " + method +
                        " to be used as " + name + " storage.");
      }
      self[method] = storage[method].bind(storage);
    });
  }

  setupMethods("volatile", volatileStorage, volatileStorageMethods);
  setupMethods("persistent", persistentStorage, persistentStorageMethods);

  this.drop = function(callback) {
    volatileStorage.drop(function(err) {
      if (err) {
        callback(err);
        return;
      }
      persistentStorage.drop(callback);
    });
  };

  this.ping = function(callback) {
    volatileStorage.ping(function(err) {
      if (err) {
        callback(err);
        return;
      }
      persistentStorage.ping(callback);
    });
  };

  this.cleanSession = function(hawkHmacId, callback) {
    volatileStorage.cleanSession(hawkHmacId, function(err) {
      if (err) {
        callback(err);
        return;
      }
      persistentStorage.cleanSession(hawkHmacId, callback);
    });
  };
}

module.exports = StorageProxy;
