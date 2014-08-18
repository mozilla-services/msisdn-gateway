/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
var pjson = require("../../package.json");


module.exports = function(app, conf, logError, storage) {
  /**
   * Checks that the service and its dependencies are healthy.
   **/
  app.get("/__heartbeat__", function(req, res) {
    storage.ping(function(storageStatus) {
      var status;
      if (storageStatus === true) {
        status = 200;
      } else {
        status = 503;
      }

      res.json(status, {
        storage: storageStatus
      });
    });
  });

  /**
   * Displays some version information at the root of the service.
   **/
  app.get("/", function(req, res) {
    var serverInfo = {
      name: pjson.name,
      description: pjson.description,
      version: pjson.version,
      homepage: pjson.homepage,
      endpoint: conf.get("protocol") + "://" + req.get("host")
    };

    if (!conf.get("displayVersion")) {
      delete serverInfo.version;
    }
    res.json(200, serverInfo);
  });
};
