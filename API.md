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
  * [POST /v1/msisdn/discover](#post-v1msisdndiscover)
  * [POST /v1/msisdn/register](#post-v1msisdnregister)
  * [POST /v1/msisdn/unregister](#post-v1msisdnunregister) :lock:
  * [POST /v1/msisdn/sms/mt/verify](#post-v1msisdnsmsmtverify) :lock:
  * [SMS  /v1/msisdn/sms/momt/verify](#sms-v1msisdnsmsmomtverify)
  * [POST /v1/msisdn/sms/verify_code](#post-v1msisdnverify_code) :lock:
  * [POST /v1/certificate/sign](#post-v1certificatesign) :lock:

## URL Structure

All requests will be to URLs for the form:

    https://<server-url>/v1/<api-endpoint>

Note that:

* All API access must be over a properly-validated HTTPS connection.
* The URL embeds a version identifier "v1"; future revisions of this API may introduce new version numbers.
* The base URL of the server may be configured on a per-client basis:

## Request Format

Requests that require authentication use [Hawk](https://github.com/hueniverse/hawk) request signatures.
These endpoints are marked :lock: in the description below.

All POST requests must have a content-type of `application/json` with a utf8-encoded JSON body, and must specify the content-length header.  Keys and other binary data are included in the JSON as base16 encoded strings.

## Response Format

All successful requests will produce a response with HTTP status code of "200" and content-type of "application/json".  The structure of the response body will depend on the endpoint in question.

Failures due to invalid behavior from the client will produce a response with HTTP status code in the "4XX" range and content-type of "application/json".  Failures due to an unexpected situation on the server will produce a response with HTTP status code in the "5XX" range and content-type of "application/json".

To simplify error handling for the client, the type of error is indicated both by a particular HTTP status code, and by an application-specific error code in the JSON response body.  For example:

```js
{
  "code": 400, // matches the HTTP status code
  "errno": 107, // stable application-level error number
  "error": "Bad Request", // string description of the error type
  "message": "the value of msisdn is not allowed to be undefined",
  "info": "https://msisdn.accounts.firefox.com/errors/1234" // link to more info on the error
}
```

Responses for particular types of error may include additional parameters.

The currently-defined error responses are:

* status code 400, errno 104:  attempt to operate on an unverified account
* status code 400, errno 105:  invalid verification code
* status code 400, errno 106:  request body was not valid json
* status code 400, errno 107:  request body contains invalid parameters
* status code 400, errno 108:  request body missing required parameters
* status code 401, errno 109:  invalid request signature
* status code 401, errno 110:  invalid authentication token
* status code 410, errno 111:  endpoint is no longer supported
* status code 411, errno 112:  content-length header was not provided
* status code 413, errno 113:  request body too large
* status code 429, errno 114:  client has sent too many requests for the "short verification code" flow (see [backoff protocol](#backoff-protocol))
* status code 429, errno 115:  client has sent too many requests for the given MSISDN (see [backoff protocol](#backoff-protocol))
* status code 429, errno 116:  client has sent too many requests for the verification method (see [backoff protocol](#backoff-protocol))
* status code 429, errno 117:  client has sent too many requests - unspecified (see [backoff protocol](#backoff-protocol))
* status code 503, errno 201:  service temporarily unavailable to due high load (see [backoff protocol](#backoff-protocol))
* any status code, errno 999:  unknown error

The follow error responses include additional parameters:

* errno 114:  a `retryAfter` parameter indicating how long the client should wait before re-trying.
* errno 115:  a `retryAfter` parameter indicating how long the client should wait before re-trying.
* errno 116:  a `retryAfter` parameter indicating how long the client should wait before re-trying.
* errno 117:  a `retryAfter` parameter indicating how long the client should wait before re-trying.
* errno 201:  a `retryAfter` parameter indicating how long the client should wait before re-trying.

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
* `msisdn` - (optional) the client's claimed MSISDN in E.164 format. Providing an MSISDN is optional as the client might not know it in advance but allows the server to decide which verification mechanism to use in a better way. For instance, if an MSISDN is provided, even if an SMS MO + MT flow is possible an SMS MT only flow should be chosen by the server instead.
* `mcc` - [Mobile Country Code](http://es.wikipedia.org/wiki/MCC/MNC)
* `mnc` - [Mobile Network Code](http://es.wikipedia.org/wiki/MCC/MNC)
* `roaming` - boolean that indicates if the device is on roaming or not

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{
  "verificationMethods": ["sms/momt", "sms/mt"],
  "verificationDetails": {
    "sms/mt": {
      "mtSender": "123",
      "url": "https://msisdn.accounts.firefox.com/v1/msisdn/sms/mt/verify"
    },
    "sms/momt": {
      "mtSender": "123",
      "moVerifier": "234"
    }
  }
}
```

* `verificationMethods` - a list of verification methods available for the given set of parameters, in order of preferred use
* `verificationDetails` - an object whose keys are the elements of `verificationMethods` and whose values are the details of each method

The methods listed in `verificationMethods` are sorted in the preferred order from the perspective of the server, i.e., the method listed first is the most preferred method.

Failing requests may be due to the following errors:

* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 117: client has sent too many requests - unspecified
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

* status code 429, errno 117: client has sent too many requests - unspecified
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
* status code 429, errno 117: client has sent too many requests - unspecified
* status code 503, errno 201: service temporarily unavailable to due high load

### Response

Successful requests will produce a "204 No Content" response.


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
  "msisdn": "+442071838750",
  "mcc": "365",
  "mnc": "010"
}'
```

or

```sh
curl -v \
-X POST \
-H "Content-Type: application/json" \
"https://msisdn.accounts.firefox.com/v1/msisdn/sms/mt/verify" \
-H 'Authorization: Hawk id="d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d", ts="1373391043", nonce="ohQjqb", hash="vBODPWhDhiRWM4tmI9qp+np+3aoqEFzdGuGk0h7bh9w=", mac="LAnpP3P2PXelC6hUoUaHP72nCqY5Iibaa3eeiGBqIIU="' \
-H 'Accept-Language: da, en-gb' \
-d '{
  "msisdn": "+442071838750",
  "mcc": "365",
  "shortVerificationCode: true"
}'
```

___Parameters___
* `msisdn` - the client's claimed MSISDN in E.164 format.
* `shortVerificationCode` - (optional) if `true`, the server should send a short, human transcribable code with instructional text in the verification SMS. If `false` or excluded, the server will send a longer code without text. If `true`, the client should also take care to set the `Accept-Language` header so the server can appropriate localize any text in the SMS.

### Response

Successful requests will produce a "204 No Content" response.

Failing requests may be due to the following errors:

* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 401, errno 110: invalid authentication token
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 114: client has sent too many requests with short verification code
* status code 429, errno 115: client has sent too many requests for MSISDN
* status code 429, errno 116: client has sent too many requests for verification method
* status code 429, errno 117: client has sent too many requests - unspecified
* status code 503, errno 201: service temporarily unavailable to due high load

Successful requests also trigger the sending of a SMS-MT message from the server's `mtSender` number to the client's MSISDN with verification code in the body:

(default)
```
aac4b1e3f1791ef83886c27519979b93a45e6d0da34c7509ca632aca5a28a47c
```

(`shortVerificationCode` is `true`)
```
Your verification code: 146193
```

## SMS /v1/msisdn/sms/momt/verify

A SMS-MO message sent to the `moVerifier` number in the `verificationDetails` for the `sms:momt` flow returned by a previous call to [POST /v1/msisdn/discover](#post-v1msisdndiscover).

### SMS-MO request body sent to `moVerifier`

```
/v1/msisdn/sms/momt/verify d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d
```

___Parameters___
Parameters are unnamed and space delimited
1) The first value is the API endpoint for this request
2) The second value is  the Hawk `id` parameter derived via HKDF

### SMS-MT response body sent from `mtSender`

Successful requests trigger the sending of a SMS-MT message from the server's `mtSender` number to the client's MSISDN with the verification code in the body:

```
aac4b1e3f1791ef83886c27519979b93a45e6d0da34c7509ca632aca5a28a47c
```

Note: This code is the similar to the SMS-MT code sent in response to a [POST /v1/msisdn/sms/mt/verify](#post-v1msisdnsmsmtverify) call when `shortVerificationCode=true`.

## POST /v1/msisdn/sms/verify_code

:lock: HAWK-authenticated with a `msisdnSessionToken`.

This verifies the SMS code sent to a MSISDN.

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
  "code": "146193"
}'
```

___Parameters___
* `code` - the SMS verification code sent to the MSISDN

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{
  "msisdn": "+442071838750"
}
```

The response includes the client's MSISDN value. This may be useful in the future, e.g., if the client previously used the SMS MO+MT flow because it didn't know the MSISDN.

Failing requests may be due to the following errors:
* status code 400, errno 105: invalid verification code
* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 401, errno 110: invalid authentication token
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 114: client has sent too many requests with short verification code
* status code 429, errno 115: client has sent too many requests for MSISDN
* status code 429, errno 116: client has sent too many requests for verification method
* status code 429, errno 117: client has sent too many requests - unspecified

* status code 503, errno 201: service temporarily unavailable to due high load

## POST /v1/certificate/sign

:lock: HAWK-authenticated with a `msisdnSessionToken`.

The server is given a public key,
and returns a signed certificate using the same JWT-like mechanism as
a BrowserID primary IdP would (see the [browserid-certifier
project](https://github.com/mozilla/browserid-certifier for details)). The
signed certificate includes a `principal.email` property to indicate a "Firefox
Account-like" identifier (a uuid at the account server's primary domain). This endpoint can only after the MSISDN associated with the `msisdnSessionToken` has been verified.

TODO:
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
"https://msisdn.accounts.firefox.com/v1/certificate/sign" \
-H 'Authorization: Hawk id="d4c5b1e3f5791ef83896c27519979b93a45e6d0da34c7509c5632ac35b28b48d", ts="1373391043", nonce="ohQjqb", hash="vBODPWhDhiRWM4tmI9qp+np+3aoqEFzdGuGk0h7bh9w=", mac="LAnpP3P2PXelC6hUoUaHP72nCqY5Iibaa3eeiGBqIIU="' \
-d '{
  "publicKey": {
    "algorithm":"RS",
    "n":"4759385967235610503571494339196749614544606692567785790953934768202714280652973091341316862993582789079872007974809511698859885077002492642203267408776123",
    "e":"65537"
  },
  "duration": 86400 // one day
}'
```

___Parameters___
* `publicKey` - the key to sign (run `bin/generate-keypair` from
  [jwcrypto](https://github.com/mozilla/jwcrypto))
    * algorithm - "RS" or "DS"
    * n - RS only
    * e - RS only
    * y - DS only
    * p - DS only
    * q - DS only
    * g - DS only
* `duration` - (optional) time interval from now when the certificate will expire in
  seconds

The server may impose its own limitation on the duration of the signed certificate if the client provides a `duration` value. We expect the `duration` to be relatively short (e.g., a day) in order to keep the public key parameters a reasonable size. 

### Response

Successful requests will produce a "200 OK" response with following format:

```json
{
  "cert": "eyJhbGciOiJEUzI1NiJ9.eyJwdWJsaWMta2V5Ijp7ImFsZ29yaXRobSI6IlJTIiwibiI6IjU3NjE1NTUwOTM3NjU1NDk2MDk4MjAyMjM2MDYyOTA3Mzg5ODMyMzI0MjUyMDY2Mzc4OTA0ODUyNDgyMjUzODg1MTA3MzQzMTY5MzI2OTEyNDkxNjY5NjQxNTQ3NzQ1OTM3NzAxNzYzMTk1NzQ3NDI1NTEyNjU5NjM2MDgwMzYzNjE3MTc1MzMzNjY5MzEyNTA2OTk1MzMyNDMiLCJlIjoiNjU1MzcifSwicHJpbmNpcGFsIjp7ImVtYWlsIjoiZm9vQGV4YW1wbGUuY29tIn0sImlhdCI6MTM3MzM5MjE4OTA5MywiZXhwIjoxMzczMzkyMjM5MDkzLCJpc3MiOiIxMjcuMC4wLjE6OTAwMCJ9.l5I6WSjsDIwCKIz_9d3juwHGlzVcvI90T2lv2maDlr8bvtMglUKFFWlN_JEzNyPBcMDrvNmu5hnhyN7vtwLu3Q"
}
```

The signed certificate includes these additional claims:

* verifiedMSISDN - the user's verified MSISDN
* lastVerifiedAt - time of last MSISDN verification (seconds since epoch)

Failing requests may be due to the following errors:

* status code 400, errno 104: attempt to operate on an unverified account
* status code 400, errno 106: request body was not valid json
* status code 400, errno 107: request body contains invalid parameters
* status code 400, errno 108: request body missing required parameters
* status code 401, errno 110: invalid authentication token
* status code 411, errno 112: content-length header was not provided
* status code 413, errno 113: request body too large
* status code 429, errno 117: client has sent too many requests - unspecified
* status code 503, errno 201: service temporarily unavailable to due high load

# Backoff Protocol

During periods of heavy load, the server may request that clients enter a "backoff" state in which they avoid making further requests.

If the server is under too much load to handle the client's request, it will return a `503 Service Unavailable` HTTP response.  The response will include `Retry-After` header giving the number of seconds that the client should wait before issuing any further requests.  It will also include a [JSON error response](#response-format) with `errno` of 201, and with a `retryAfter` field that matches the value in the `Retry-After` header.  For example, the following response would indicate that the server could not process the request and the client should avoid sending additional requests for 30 seconds:

```
HTTP/1.1 503 Service Unavailable
Retry-After: 30
Content-Type: application/json

{
 "code": 503,
 "errno": 201,
 "error": "Service Unavailable",
 "message": "The server is experiencing heavy load, please try again shortly",
 "info": "https://github.com/mozilla/msisdn-gateway/blob/master/docs/api.md#response-format",
 "retryAfter": 30
}
```

The `Retry-After` value is included in both the headers and body so that clients can choose to handle it at the most appropriate level of abstraction for their environment.

If an individual client is found to be issuing too many requests in quick succession, the server may return a `429 Too Many Requests` response.  This is similar to the `503 Service Unavailable` response but indicates that the problem originates from the client's behavior, rather than the server.  The response will include `Retry-After` header giving the number of seconds that the client should wait before issuing any further requests.  It will also include a [JSON error response](#response-format) with `errno` of 114-117, and with a `retryAfter` field that matches the value in the `Retry-After` header.  For example:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{
 "code": 429,
 "errno": 114,
 "error": "Too Many Requests",
 "message": "This client has sent too many requests",
 "info": "https://github.com/mozilla/msisdn-gateway/blob/master/docs/api.md#response-format",
 "retryAfter": 30
}
```

