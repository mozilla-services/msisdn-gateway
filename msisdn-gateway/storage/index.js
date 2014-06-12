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
    "setSession", "getSession"
  ];

  var persistentStorageMethods = [
    "setCertificateData", "getCertificateData"
  ];

  var proxyMethods = [
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

  function setProxyMethods(_volatileStorage, _persistentStorage, methods) {
    methods.forEach(function(method) {
      var type;
      if (typeof _volatileStorage[method] !== "function") {
        type = _volatileStorage.constructor.name;
        throw new Error(type + " need a " + method +
                        " to be used as volatile storage.");
      }
      if (typeof _persistentStorage[method] !== "function") {
        type = _volatileStorage.constructor.name;
        throw new Error(type + " need a " + method +
                        " to be used as volatile storage.");
      }
      self[method] = function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        _volatileStorage[method].apply(_volatileStorage, args.concat([
          function() {
            var cbArgs = Array.prototype.slice.call(arguments);
            if (cbArgs[0]) {
              callback(cbArgs[0]);
              return;
            }
            _persistentStorage[method].apply(_persistentStorage,
                                             args.concat(callback));
          }
        ]));
      };
    });
  }

  setupMethods("volatile", volatileStorage, volatileStorageMethods);
  setupMethods("persistent", persistentStorage, persistentStorageMethods);
  setProxyMethods(volatileStorage, persistentStorage, proxyMethods);
}

module.exports = StorageProxy;
