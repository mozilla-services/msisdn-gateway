/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var bidcrypto = require('browserid-crypto');

// Make sure to load supported algorithms.
require('browserid-crypto/lib/algs/rs');
require('browserid-crypto/lib/algs/ds');


module.exports = function(app, conf) {
  /***********************
   * BrowserId IdP views *
   ***********************/
  var _publicKey = bidcrypto.loadPublicKeyFromObject(conf.get('BIDPublicKey'));

  /**
   * Well known BrowserId
   */
  app.get("/.well-known/browserid", function(req, res) {
    res.json(200, {
      "public-key": JSON.parse(_publicKey.serialize()),
      "authentication": "/.well-known/browserid/warning.html",
      "provisioning": "/.well-known/browserid/warning.html"
    });
  });

  app.get("/.well-known/browserid/warning.html", function(req, res) {
    res.sendfile(__dirname + "/templates/idp-warning.html");
  });
};
