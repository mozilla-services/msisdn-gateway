/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var errors = require("../errno");
var hmac = require("../hmac");
var sendError = require("../middleware").sendError;
var Token = require("../token").Token;


module.exports = function(app, conf, logError, storage, hawkMiddleware) {
  /**
   * Ask for a new number registration.
   **/
  app.post("/register", function(req, res) {
    var token = new Token();
    token.getCredentials(function(tokenId, authKey, sessionToken) {
      var hawkHmacId = hmac(tokenId, conf.get("hawkIdSecret"));
      storage.setSession(hawkHmacId, authKey, function(err) {
        if (err) {
          logError(err);
          sendError(res, 503, errors.BACKEND, "Service Unavailable");
          return;
        }

        res.json(200, {
          msisdnSessionToken: sessionToken
        });
      });
    });
  });

  /**
   * Unregister the session.
   **/
  app.post("/unregister", hawkMiddleware, function(req, res) {
    storage.cleanSession(req.hawkHmacId, function(err) {
      if (err) {
        logError(err);
        sendError(res, 503, errors.BACKEND, "Service Unavailable");
        return;
      }
      res.json(204, "");
    });
  });
};
