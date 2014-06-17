/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

module.exports = {
  persistentSchema: {
    AttributeDefinitions: [
      {
        AttributeName: "hawkHmacId",
        AttributeType: "S"
      }
    ],
    KeySchema: [
      {
        AttributeName: "hawkHmacId",
        KeyType: "HASH"
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 10, // Need to be configured for production
      WriteCapacityUnits: 10 // Need to be configured for production
    },
    TableName: "certificateData"
  }
};
