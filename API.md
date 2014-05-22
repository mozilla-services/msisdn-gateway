# MSISDN Verification API

This document provides protocol-level and usage details for the Mozilla MSISDN Verification API.

# Obtaining the MSISDN

### Getting it from the SIM card

It is possible to obtain the MSISDN from the SIM card if this value is filled
by the operator. However, this is not the general case and many operators
doesn't write this value to the SIM. In any case, even if it is available this
field can be modified by the user at any time and so it cannot be trusted
without a proper verification.

### SMS-MO

Another mechanism to obtain the MSISDN is by asking the device to send an
SMS-MO (Mobile Originated) message to a specific phone number or short code.
This requires support from the operator in order to make sure that the SMS is
charge-free for the user.

### Asking the user

This is the fallback if all the above options are not available.

# Verification mechanisms

### Network based authentication

Some operators may support a network-based authentication mechanism where the
device is authenticated by making an http request to the authentication server
over the device's mobile data connection such that the carrier injects a header
which contains a token that can be used to verify the users MSISDN.

This kind of authentication mechanism does not require us to provide an MSISDN
in advance and so the whole flow can be done without user interaction.

### SMS based authentication

#### SMS-MT only

In an SMS-MT (Mobile Terminated) only based authentication the verification
server is given an MSISDN to send an SMS with a verification code and the
device makes an http request to give the verification code back to the server
as a proof of ownership.

This requires us to provide an MSISDN in advance and so the flow might require
user interaction.

It is also possible that the given MSISDN does not belong to the device from
where the requests to the verification server are done and so the SMS will be
received by another device. In that case, the user will need to manually enter
the verification code. This is the scenario for an MSISDN verification
triggered by a desktop client.

#### SMS-MO and SMS-MT

In an SMS-MO (Mobile Originated) + SMS-MT (Mobile Terminated) based
authentication, the device sends an SMS to the verification server which
replies back with a SMS verification code that must be given back to the server
as a proof of ownership.

This mechanism does not require us to provide an MSISDN in advance and so the
flow can be done without user interaction.

This flow requires support from the operator to assure that the phone number or
the short code that the device uses to send the SMS-MO is free of charge for
the user.

### Telephony call based authentication

# Flows

## SMS MT

<img src="http://www.gliffy.com/go/publish/image/5685727/L.png" />

## SMS MO + MT

<img src="http://www.gliffy.com/go/publish/image/5685725/L.png" />

# API Endpoints
  * [POST /v1/msisdn/register](#post-v1msisdnregister)
  * [POST /v1/msisdn/unregister](#post-v1msisdnunregister) :lock:
  * [POST /v1/msisdn/sms/mt/verify](#post-v1msisdnsmsmtverify) :lock:
  * [SMS  /v1/msisdn/sms/momt/verify](#sms-v1msisdnsmsmomtverify)
  * [POST /v1/msisdn/sms/verify_code](#post-v1msisdnverify_code) :lock:

## POST /v1/msisdn/discover

For the given network information (msisdn, mcc, mnc and roaming), the verification service returns a list of available verification methods and the corresponding details.

### Request

```sh
curl -v \
-X POST \
-H "Content-Type: application/json" \
"https://msisdn.accounts.firefox.com/v1/msisdn/discover" \
-d '{
  "msisdn": "+442071838750"
  "mcc": "214",
  "mnc": "07",
  "roaming": false
}'
```

___Parameters___
* `msisdn` - a MSISDN in E.164 format. Providing an MSISDN is optional as the
  client might not know it in advance but allows the server to decide which
  verification mechanism to use in a better way. For instance, if an MSISDN is
  provided, even if an SMS MO + MT flow is possible an SMS MT only flow should
  be chosen by the server instead.
* `mcc` - [Mobile Country Code](http://es.wikipedia.org/wiki/MCC/MNC)
* `mnc` - [Mobile Network Code](http://es.wikipedia.org/wiki/MCC/MNC)
* `roaming` - boolean that indicates if the device is on roaming or not

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{
  "verificationMethods": [ "sms:momt", "sms:mt" ],
  "verificationDetails": {
    "sms:mt": {
      "mtSender": "123"
    },
    "sms:momt": {
      "mtSender": "123",
      "moVerifier": "234"
    }
  }
}
```

* `verificationMethods` - a list of verification methods available for the given set of parameters
* `verificationDetails` - an object whose keys are the elements of `verificationMethods` and whose values are the details of each method

Failing requests may be due to the following errors:

* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 114: client has sent too many requests
* status code 503, errno 201: service temporarily unavailable to due high load

## POST /v1/msisdn/register

Starts a MSISDN registration session.

### Request

```sh
curl -v \
-X POST \
-H "Content-Type: application/json" \
"https://msisdn.accounts.firefox.com/v1/msisdn/register"
```

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{
  "msisdnSessionToken": "27cd4f4a4aa03d7d186a2ec81cbf19d5c8a604713362df9ee15c4f4a4aa03d7d"
}
```

* `msisdnSessionToken` - used to build Hawk credentials from HKDF

Failing requests may be due to the following errors:

* status code 429, errno 114: client has sent too many requests
* status code 503, errno 201: service temporarily unavailable to due high load

## POST /v1/msisdn/unregister

:lock: HAWK-authenticated with a `msisdnSessionToken`.

This completely removes a previously registered MSISDN associated with the `msisdnSessionToken`.

### Request

The request must include a Hawk header that authenticates the request
(including payload) using a `msisdnSessionToken` received from
`/v1/msisdn/register`.

```sh
curl -v \
-X POST \
-H "Content-Type: application/json" \
"https://msisdn.accounts.firefox.com/v1/msisdn/unregister" \
-H 'Authorization: Hawk id="d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d", ts="1373391043", nonce="ohQjqb", hash="vBODPWhDhiRWM4tmI9qp+np+3aoqEFzdGuGk0h7bh9w=", mac="LAnpP3P2PXelC6hUoUaHP72nCqY5Iibaa3eeiGBqIIU="'
```

Failing requests may be due to the following errors:

* status code 401, errno 110: invalid authentication token
* status code 429, errno 114: client has sent too many requests
* status code 503, errno 201: service temporarily unavailable to due high load

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{}
```

## POST /v1/msisdn/sms/mt/verify

### Request

:lock: HAWK-authenticated with a `msisdnSessionToken`.

```sh
curl -v \
-X POST \
-H "Content-Type: application/json" \
"https://msisdn.accounts.firefox.com/v1/msisdn/sms/mt/verify" \
-H 'Authorization: Hawk id="d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d", ts="1373391043", nonce="ohQjqb", hash="vBODPWhDhiRWM4tmI9qp+np+3aoqEFzdGuGk0h7bh9w=", mac="LAnpP3P2PXelC6hUoUaHP72nCqY5Iibaa3eeiGBqIIU="' \
-d '{
  "msisdn": "+442071838750"
}'
```

___Parameters___
* `msisdn` - a MSISDN in E.164 format.

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{}
```

Failing requests may be due to the following errors:

* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 401, errno 110: invalid authentication token
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 114: client has sent too many requests
* status code 503, errno 201: service temporarily unavailable to due high load

Successful requests also trigger the sending of a SMS-MT message from the server's `mtSender` number to the client's MSISDN.

```json
{
  "code": "e3c5b"
}
```

* `code` - the verification code

## SMS /v1/msisdn/sms/momt/verify

A SMS-MO message to the `moVerifier` number in the `verificationDetails` for the `sms:momt` flow returned by a previous call to [POST /v1/msisdn/discover](#post-v1msisdndiscover). The body of the SMS is a JSON body.

### Request

SMS-MO message sent to `moVerifier` number with following body:

```json
'{
  "endpoint": "/v1/msisdn/sms/momt/verify"
  "id": "d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d"
}'
```

___Parameters___
* `endpoint` - the API endpoint for this request
* `id` - the Hawk `id` parameter derived via HKDF

### Response

Successful requests trigger the sending of a SMS-MT message from the server's `mtSender` number to the client's MSISDN with the following body:

```json
{
  "msisdn": "+442071838750",
  "code": "e3c5b"
}
```

* `msisdn` - the client's MSISDN, as determined by the server
* `code` - the verification code

## POST /v1/msisdn/sms/verify_code

:lock: HAWK-authenticated with a `msisdnSessionToken`.

This verifies the SMS code sent to a MSISDN. The server is given a public key,
and returns a signed certificate using the same JWT-like mechanism as
a BrowserID primary IdP would (see the [browserid-certifier
project](https://github.com/mozilla/browserid-certifier for details)). The
signed certificate includes a `principal.email` property to indicate a "Firefox
Account-like" identifier (a uuid at the account server's primary domain). TODO:
add discussion about how this id will likely *not* be stable for repeated calls
to this endpoint with the same MSISDN (alone), but probably stable for repeated
calls with the same MSISDN+`msisdnSessionToken`.

### Request

The request must include a Hawk header that authenticates the request
(including payload) using a `msisdnSessionToken` received from
`/v1/msisdn/register`.

```sh
curl -v \
-X POST \
-H "Content-Type: application/json" \
"https://msisdn.accounts.firefox.com/v1/msisdn/sms/verify_code" \
-H 'Authorization: Hawk id="d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d", ts="1373391043", nonce="ohQjqb", hash="vBODPWhDhiRWM4tmI9qp+np+3aoqEFzdGuGk0h7bh9w=", mac="LAnpP3P2PXelC6hUoUaHP72nCqY5Iibaa3eeiGBqIIU="' \
-d '{
  "code": "e3c5b",
  "publicKey": {
    "algorithm":"RS",
    "n":"4759385967235610503571494339196749614544606692567785790953934768202714280652973091341316862993582789079872007974809511698859885077002492642203267408776123",
    "e":"65537"
  },
  "duration": 86400000
}'
```

___Parameters___
* `code` - the SMS verification code sent to the MSISDN
* `publicKey` - the key to sign (run `bin/generate-keypair` from
  [jwcrypto](https://github.com/mozilla/jwcrypto))
    * algorithm - "RS" or "DS"
    * n - RS only
    * e - RS only
    * y - DS only
    * p - DS only
    * q - DS only
    * g - DS only
* `duration` - time interval from now when the certificate will expire in
  seconds

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{
  "cert": "eyJhbGciOiJEUzI1NiJ9.eyJwdWJsaWMta2V5Ijp7ImFsZ29yaXRobSI6IlJTIiwibiI6IjU3NjE1NTUwOTM3NjU1NDk2MDk4MjAyMjM2MDYyOTA3Mzg5ODMyMzI0MjUyMDY2Mzc4OTA0ODUyNDgyMjUzODg1MTA3MzQzMTY5MzI2OTEyNDkxNjY5NjQxNTQ3NzQ1OTM3NzAxNzYzMTk1NzQ3NDI1NTEyNjU5NjM2MDgwMzYzNjE3MTc1MzMzNjY5MzEyNTA2OTk1MzMyNDMiLCJlIjoiNjU1MzcifSwicHJpbmNpcGFsIjp7ImVtYWlsIjoiZm9vQGV4YW1wbGUuY29tIn0sImlhdCI6MTM3MzM5MjE4OTA5MywiZXhwIjoxMzczMzkyMjM5MDkzLCJpc3MiOiIxMjcuMC4wLjE6OTAwMCJ9.l5I6WSjsDIwCKIz_9d3juwHGlzVcvI90T2lv2maDlr8bvtMglUKFFWlN_JEzNyPBcMDrvNmu5hnhyN7vtwLu3Q"
}
```

The signed certificate includes these additional claims:

* fxa-verifiedMSISDN - the user's verified MSISDN
* fxa-lastVerifiedAt - time of last MSISDN verification (seconds since epoch)

Failing requests may be due to the following errors:

* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 401, errno 110: invalid authentication token
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 114: client has sent too many requests
* status code 503, errno 201: service temporarily unavailable to due high load
