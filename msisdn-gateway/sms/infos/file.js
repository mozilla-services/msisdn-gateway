/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var format = require("util").format;


function FileMap(settings) {
  this.moVerifierMapping = settings.moVerifierMapping;
  this.defaultMoVerifier = settings.moVerifier;
  this.mtSenderMapping = settings.mtSenderMapping;
  this.defaultMtSender = settings.mtSender;
}

FileMap.prototype = {
  /**
   * Get the mtSender number with regards to MCC/MNC
   */
  getMtSenderFor: function getMtSenderFor(mcc, mnc, callback) {
    if (mnc === undefined) mnc = "";
    var mccMnc = format("%s%s", mcc, mnc);
    if (this.mtSenderMapping.hasOwnProperty(mccMnc)) {
      callback(null, this.mtSenderMapping[mccMnc]);
      return;
    }
    if (this.mtSenderMapping.hasOwnProperty(mcc)) {
      callback(null, this.mtSenderMapping[mcc]);
      return;
    }
    callback(null, this.defaultMtSender);
  },

  /**
   * Get the moVerifier number with regards to MCC/MNC
   */
  getMoVerifierFor: function getMoVerifierFor(mcc, mnc, callback) {
    if (mnc === undefined) mnc = "";
    var mccMnc = format("%s%s", mcc, mnc);
    if (this.moVerifierMapping.hasOwnProperty(mccMnc)) {
      callback(null, this.moVerifierMapping[mccMnc]);
      return;
    }
    if (this.moVerifierMapping.hasOwnProperty(mcc)) {
      callback(null, this.moVerifierMapping[mcc]);
      return;
    }
    // If the defaultMoVerifier is not set, return null.
    if (this.defaultMoVerifier) {
      callback(null, this.defaultMoVerifier);
      return;
    }
    callback(null, null);
  }
};

module.exports = FileMap;
