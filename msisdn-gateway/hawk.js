/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var conf = require('./config').conf;
var errors = require('./errno.json');
var hawk = require('express-hawkauth');
var hmac = require("./hmac");
var sendError = require("./middleware").sendError;


module.exports = function(storage) {
  function getHawkSession(id, callback) {
    var hawkHmacId = hmac(id, conf.get("hawkIdSecret"));
    storage.getSession(hawkHmacId, function(err, sessionKey) {
      if (err) {
        callback(err);
        return;
      }
      if (sessionKey === null) {
        storage.getCertificateData(hawkHmacId,
          function(err, certificateData) {
            if (err) {
              callback(err);
              return;
            }
            if (certificateData === null) {
              callback(null, null);
              return;
            }
            callback(null, {
              key: certificateData.hawkKey,
              algorithm: "sha256"
            });
          });
        return;
      }
      callback(null, sessionKey);
    });
  }

  /**
   * Attach the identity of the user to the request if she is registered in the
   * database.
   **/
  function setUser(req, res, credentials, done) {
    req.hawkHmacId = hmac(credentials.id, conf.get("hawkIdSecret"));
    req.hawk.key = credentials.key;
    done();
  }

  function hawkSendError(res, status, payload) {
    var errno = errors.INVALID_AUTH_TOKEN;
    if (status === 503) {
      errno = errors.BACKEND;
    }
    sendError(res, status, errno, payload.message);
  }

  var hawkOptions = {
    port: conf.get("protocol") === "https" ? 443 : undefined
  };

  return hawk.getMiddleware({
    hawkOptions: hawkOptions,
    getSession: getHawkSession,
    setUser: setUser,
    sendError: hawkSendError
  });
};
