/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var aws = require('aws-sdk');

var schemas = require("./dynamo_schema");
var SCHEMA_NAME = "persistentSchema";

function DynamoDBStorage(settings) {
  this._settings = settings;
  this._tableName = this._settings.tableName;
  this._setup = false;
  this._maxCount = this._settings.maxCount || 5;
  this.persistentOnly = true;

  if (this._tableName === undefined) {
    throw new Error("The tableName setting is required.");
  }
  this._tableSchema = schemas[SCHEMA_NAME];

  if (!this._settings.hasOwnProperty('region')) {
    if (!(this._settings.hasOwnProperty('host') &&
          this._settings.hasOwnProperty('port'))) {
      throw new Error("Either a region or a host, port settings are required.");
    }
  }

  // Update the AWS config with the provided settings.
  aws.config.update(this._settings);

  // Building the endpoint if not on AWS.
  if (!this._settings.hasOwnProperty('region')) {
    var endpoint = this._settings.host + ':' + this._settings.port;
    aws.config.update({endpoint: endpoint, region: "xxx"});
  }

  this._db = new aws.DynamoDB();
}

DynamoDBStorage.prototype = {
  _ensureConnected: function _ensureConnected(callback) {
   /**
    * Ensures the database is connected and the Table created and ACTIVE.
    *
    * @private
    * @param {Function} cb Callback(err)
    */

    var self = this;

    if (self._setup) {
      callback(null);
      return;
    }

    // Look for an existing Table
    self._db.describeTable({
      TableName: self._tableName
    }, function(err) {
      if (err) {
        // In case of Database Error
        if (err.statusCode !== 400) {
          callback(err);
          return;
        }

        // Create the table if it doesn't exist.
        self._db.createTable(self._tableSchema,
          function(err, data) {
            if (err) {
              callback(err);
              return;
            }
            var count = 0;

            // Wait for the Table to have ACTIVE status.
            function waitForCreation() {
              self._db.describeTable({
                TableName: self._tableName
              }, function (err, data) {
                if (err) {
                  if (err.statusCode === 400) {
                    if (count < self._maxCount) {
                      setTimeout(waitForCreation, 50);
                      return;
                    }
                  }
                  callback(err);
                  return;
                }
                if (data.Table.TableStatus !== "ACTIVE") {
                  if (count < self._maxCount) {
                    setTimeout(waitForCreation, 50);
                    return;
                  }
                  callback(new Error("Table is not ACTIVE. STATUS: " +
                                     data.Table.TableStatus));
                  return;
                }
                self._setup = true;
                callback(null);
                return;
              });
            }
            waitForCreation();
          });
        return;
      }
      self._setup = true;
      callback(null);
    });
  },

  dynamoFromObject: function dynamoFromObject(record) {
    /**
     * Convert a JS Object into a DynamoDB Item
     */

    var item = {};

    for (var key in record) {
      var key_type = typeof record[key];

      item[key] = {};

      switch (key_type) {
      case "string":
        item[key].S = record[key];
        break;
      case "number":
        item[key].N = record[key].toString();
        break;
      default:
        throw new Error(key_type + " is not supported yet.");
      }
    }

    return item;
  },

  dynamoToObject: function dynamoToObject(item) {
    /**
     * Convert a DynamoDB Item into a JS Object
     */
    var record = {};
    function reducedDynam(value) {
      record[key] = item[key][value];
    }
    for (var key in item) {
      Object.keys(item[key]).map(reducedDynam);
    }
    return record;
  },

  setup: function(callback) {
    this._ensureConnected(function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  },

  setCertificateData: function(hawkHmacId, data, callback) {
    var self = this;
    self._ensureConnected(function(err) {
      if (err) {
        callback(err);
        return;
      }

      var dynamoObj;

      if (typeof data !== "object") {
        callback(new Error(data + " should be an object."));
        return;
      }

      data.hawkHmacId = hawkHmacId;

      try {
        dynamoObj = self.dynamoFromObject(data);
      } catch (err1) {
        callback(err1);
        return;
      }

      self._db.putItem({
        Item: dynamoObj,
        TableName: self._tableName
      }, function (err) {
        if (err) {
          callback(err);
          return;
        }
        callback(null);
      });
    });
  },

  getCertificateData: function(hawkHmacId, callback) {
    var self = this;
    self._ensureConnected(function(err) {
      if (err) {
        callback(err);
        return;
      }

      self._db.getItem({
        Key: {
          hawkHmacId: {
            S: hawkHmacId
          }
        },
        TableName: self._tableName,
        ConsistentRead: true
      }, function(err, data) {
        if (err) {
          callback(err);
          return;
        }

        var dynamoObj = self.dynamoToObject(data.Item);
        delete dynamoObj.hawkHmacId;

        if (JSON.stringify(dynamoObj) === "{}") {
          dynamoObj = null;
        }

        callback(null, dynamoObj);
      });
    });
  },

  cleanSession: function(hawkHmacId, callback) {
    var self = this;
    self._ensureConnected(function(err) {
      if (err) {
        callback(err);
        return;
      }

      self._db.deleteItem({
        Key: {
          hawkHmacId: {
            S: hawkHmacId
          }
        },
        TableName: self._tableName,
        ReturnValues: "ALL_OLD"
      }, function(err, data) {
        if (err) {
          callback(err);
          return;
        }

        callback(null, self.dynamoToObject(data.Attributes));
      });
    });
  },

  drop: function(callback) {
    var self = this;
    self._ensureConnected(function(err) {
      if (err) {
        callback(err);
        return;
      }

      self._db.deleteTable({
        TableName: self._tableName
      }, function(err) {
        if (err) {
          if (err.statusCode === 400) {
            callback(null);
            return;
          }
          callback(err);
          return;
        }

        var count = 0;

        function waitForDeletion() {
          self._db.describeTable({
            TableName: self._tableName
          }, function (err, data) {
            if (err) {
              if (err.statusCode === 400) {
                callback(null);
                return;
              }
              callback(err);
              return;
            }
            if (count < self._maxCount) {
              count++;
              setTimeout(waitForDeletion, 50);
              return;
            }
            callback(new Error("Table is not DELETING. STATUS: " +
                               data.Table.TableStatus));
            return;
          });
        }
        waitForDeletion();
      });
    });
  },

  ping: function(callback) {
    var self = this;
    self._ensureConnected(function(err) {
      if (err) {
        callback(err);
        return;
      }

      self._db.listTables({
        Limit: 1
      }, function(err) {
        callback(err === null);
      });
    });
  }
};

module.exports = DynamoDBStorage;
