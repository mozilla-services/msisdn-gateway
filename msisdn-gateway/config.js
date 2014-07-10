/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var convict = require('convict');
var format = require('util').format;
var crypto = require('crypto');
var validateJWCryptoKey = require("./utils").validateJWCryptoKey;

/**
 * Validates the keys are present in the configuration object.
 *
 * @param {List} keys  A list of keys that must be present.
 **/
function validateKeys(keys, empty) {
  if (empty === undefined) {
    empty = false;
  }

  return function(val) {
    if (!val) {
      if (!empty) {
        throw new Error("Should be defined");
      }
      return;
    }
    keys.forEach(function(key) {
      if (!val.hasOwnProperty(key))
        throw new Error(format("Should have a %s property", key));
    });
  };
}

/**
 * Build a validator that makes sure of the size and hex format of a key.
 *
 * @param {Integer}   size  Number of bytes of the key.
 * @return {Function} Validator
 **/
function hexKeyOfSize(size) {
  return function check(val) {
    if (!new RegExp(format('^[a-fA-FA0-9]{%d}$', size * 2)).test(val)) {
      throw new Error(format("Should be an %d bytes key encoded as " +
                             "hexadecimal", size));
    }
  };
}

var conf = convict({
  env: {
    doc: "The applicaton environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV"
  },
  protocol: {
    doc: "The protocol the server is behind. Should be https behind an ELB.",
    format: String,
    default: "http",
    env: "PROTOCOL"
  },
  ip: {
    doc: "The IP address to bind.",
    format: "ipaddress",
    default: "127.0.0.1",
    env: "IP_ADDRESS"
  },
  port: {
    doc: "The port to bind.",
    format: "port",
    default: 5000,
    env: "PORT"
  },
  apiPrefix: {
    doc: "The API Prefix i.e: `/v1/msisdn` (no trailing slash)",
    format: String,
    default: "",
    env: "API_PREFIX"
  },
  displayVersion: {
    doc: "Display the server version on the homepage.",
    default: true,
    format: Boolean
  },
  storage: {
    engine: {
      doc: "engine type",
      format: String,
      default: "redis"
    },
    settings: {
      doc: "js object of options to pass to the storage engine",
      format: Object,
      default: {}
    }
  },
  sentryDSN: {
    doc: "Sentry DSN",
    format: function(val) {
      if (!(typeof val === "string" || val === false)) {
        throw new Error("should be either a sentryDSN or 'false'");
      }
    },
    default: false,
    env: "SENTRY_DSN"
  },
  allowedOrigins: {
    doc: "Authorized origins for cross-origin requests.",
    format: Array,
    default: ['http://localhost:3000']
  },
  retryAfter: {
    doc: "Seconds to wait for on 503",
    format: Number,
    default: 30
  },
  consoleDateFormat: {
    doc: "Date format of the logging line in development.",
    format: String,
    default: "%y/%b/%d %H:%M:%S"
  },
  shortCodeLength: {
    doc: "Number of digits a shortVerificationCode should have",
    format: Number,
    default: 6
  },
  longCodeBytes: {
    doc: "Number of bytes a longVerificationCode should have",
    format: Number,
    default: 16
  },
  nbCodeTries: {
    doc: "Number of wrong code tries before expiration",
    format: Number,
    default: 3
  },
  hawkIdSecret: {
    doc: "The secret for hmac-ing hawk.id (16 bytes key encoded as hex)",
    format: hexKeyOfSize(16),
    default: "",
    env: "HAWK_ID_SECRET"
  },
  hawkSessionDuration: {
    doc: "The duration of hawk credentials (in seconds)",
    format: Number,
    default: 3600 * 24  // One day.
  },
  msisdnIdSecret: {
    doc: "The secret for hmac-ing msisdnId (16 bytes key encoded as hex)",
    format: hexKeyOfSize(16),
    default: "",
    env: "MSISDN_ID_SECRET"
  },
  msisdnMacSecret: {
    doc: "The secret for hmac-ing msisdnMac (16 bytes key encoded as hex)",
    format: hexKeyOfSize(16),
    default: "",
    env: "MSISDN_MAC_SECRET"
  },
  msisdnMacAlgorithm: {
    doc: "The algorithm that should be used to mac msisdn",
    format: function(val) {
      if (crypto.getHashes().indexOf(val) === -1) {
        throw new Error("Given hmac algorithm is not supported");
      }
    },
    default: "sha256",
    env: "MSISDN_MAC_ALGORITHM"
  },
  BIDPublicKey: {
    doc: "The Browser ID Public Key, run bin/generate-keypair to get them",
    format: validateJWCryptoKey
  },
  BIDSecretKey: {
    doc: "The Browser ID Private Key, run bin/generate-keypair to get them",
    format: validateJWCryptoKey
  },
  mtSender: {
    doc: "Number from which SMS are sent",
    format: String,
    default: "Mozilla@"
  },
  moVerifier: {
    doc: "Number to SMS should be sent",
    format: String,
    default: ""
  },
  moVerifierList: {
    doc: 'List of moVerifierNumber w/ regards to MCC/MNC, see config/test.json',
    format: Object,
    default: {}
  },
  smsGateways: {
    leonix: {
      endpoint: {
        doc: 'URL to the SMS outbound API endpoint',
        format: String,
        default: 'https://extranet.leonix.fr/smpp/SMS.php'
      },
      service: {
        doc: 'Client service number',
        format: String,
        default: ''
      },
      login: {
        doc: 'login name to auth to service',
        format: String,
        default: ''
      },
      pwd: {
        doc: 'password to auth to service',
        format: String,
        default: ''
      },
      priority: {
        doc: 'the priority of this backend wrt others. ' +
          '(Highest score = Highest priority)',
        format: Number,
        default: 0
      }
    },
    nexmo: {
      endpoint: {
        doc: 'URL to the SMS outbound API endpoint',
        format: String,
        default: ''
      },
      apiKey: {
        doc: 'api key',
        format: String,
        default: ''
      },
      apiSecret: {
        doc: 'api secret',
        format: String,
        default: ''
      },
      priority: {
        doc: 'the priority of this backend wrt others. ' +
          '(Highest score = Highest priority)',
        format: Number,
        default: 0
      }
    },
    beepsend: {
      endpoint: {
        doc: 'URL to the SMS outbound API endpoint',
        format: String,
        default: 'https://api.beepsend.com/2/sms'
      },
      connectionId: {
        doc: 'BeepSend connexion ID',
        format: String,
        default: 'me'
      },
      apiToken: {
        doc: 'BeepSend api token',
        format: String,
        default: ''
      },
      priority: {
        doc: 'the priority of this backend wrt others. ' +
          '(Highest score = Highest priority)',
        format: Number,
        default: 0
      }
    }
  },
  requestMaxSize: {
    doc: "The maximum size of the request",
    format: String,
    default: "25kb"
  },
  fakeEncrypt: {
    doc: "Mock sodium encrypt/decrypt calls",
    format: Boolean,
    default: false
  },
  maxHTTPSockets: {
    doc: "The maximum of HTTP sockets to use when doing requests",
    format: Number,
    default: 5
  },
  i18n: {
    defaultLang: {
      format: String,
      default: 'en-US'
    },
    debugLang: {
      format: String,
      default: 'it-CH'
    },
    supportedLanguages: {
      doc: 'List of languages this deployment should detect and ' +
        'display localized strings.',
      format: Array,
      // the big list of locales is specified so the production build script
      // can build all the locales before config/production.json is written.
      default: ['af', 'an', 'ar', 'as', 'ast', 'be', 'bg', 'bn-BD', 'bn-IN',
          'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'en-GB',
          'en-US', 'en-ZA', 'eo', 'es', 'es-AR', 'es-CL', 'es-MX', 'et', 'eu',
          'fa', 'ff', 'fi', 'fr', 'fy', 'fy-NL', 'ga', 'ga-IE', 'gd', 'gl',
          'gu', 'gu-IN', 'he', 'hi-IN', 'hr', 'ht', 'hu', 'hy-AM', 'id', 'is',
          'it', 'it-CH', 'ja', 'kk', 'km', 'kn', 'ko', 'ku', 'lij', 'lt', 'lv',
          'mai', 'mk', 'ml', 'mr', 'ms', 'nb-NO', 'ne-NP', 'nl', 'nn-NO', 'or',
          'pa', 'pa-IN', 'pl', 'pt', 'pt-BR', 'pt-PT', 'rm', 'ro', 'ru', 'si',
          'sk', 'sl', 'son', 'sq', 'sr', 'sr-LATN', 'sv', 'sv-SE', 'ta', 'te',
          'th', 'tr', 'uk', 'ur', 'vi', 'xh', 'zh-CN', 'zh-TW', 'zu'],
      env: 'I18N_SUPPORTED_LANGUAGES'
    },
    translationDirectory: {
      doc: 'The directory where per-locale .json files containing ' +
        'translations reside',
      format: String,
      default: 'app/i18n/',
      env: 'I18N_TRANSLATION_DIR'
    },
    translationType: {
      doc: 'The file format used for the translations',
      format: String,
      default: 'key-value-json',
      env: 'I18N_TRANSLATION_TYPE'
    }
  }
});


var env = conf.get('env');
try {
  conf.loadFile('./config/' + env + '.json');
} catch (err) {
  console.log("Please create your config/" + env + ".json file.\n" +
              "You can use config/sample.json as an example.\n");
  process.exit(1);
}

conf.validate();

if (conf.get('allowedOrigins') === "") {
  throw "Please defined the list of allowed origins for CORS.";
}

var smsGatewaysPrioritySet = false;
var smsGateways = conf.get('smsGateways');

Object.keys(smsGateways).forEach(function(gateway) {
  if (smsGateways[gateway].priority) {
    smsGatewaysPrioritySet = true;
  }
});

if (!smsGatewaysPrioritySet) {
  throw "Please defined at least a smsGateway's priority.";
}

module.exports = {
  conf: conf,
  hexKeyOfSize: hexKeyOfSize,
  validateKeys: validateKeys
};
