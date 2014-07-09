import hashlib
import hmac
import json
import math
import os
import random
import time
from urlparse import urlparse

import mohawk
from requests.auth import AuthBase

from loads.case import TestCase

OMXEN_URL = os.getenv("OMXEN_URL", "http://omxen.dev.mozaws.net")

print "USING %s OMXEN endpoint" % OMXEN_URL

PERCENTAGE_OF_MT_FLOW = 50  # Remining are MOMT flows
PERCENTAGE_OF_WRONG_CODES = 34  # Remining are valid ones.
PERCENTAGE_OF_SHORT_CODES = 50  # Remining are right ones.
MAX_OMXEN_TIMEOUT = 2  # Seconds to poll from omxen.

PUBLIC_KEY = '{"algorithm":"DS","y":"2bb69e89652d97315f156852c5d1a36c7ebf0fb991a3f812e55c804ca8fa8a09e6f1880de99fcaf4f5417a78a88591679219acda438f9ef4d5afb9d0ae20216414822c6187ec4f180eae6f1f2d2a0f55095e24141c8a5f12344ce4d6319042c168c962de1029a9ac1a528da2d27e4f9550b7c203572a034f077480d9f6e3ef3968902f7547a7374c5e7475dcc81002af3308d09ace22124719a83451cbd872403d6f72cf0b13b5ae0c092a3bf0daf8a26df7d618bc731306ccfbe431c9a30206327bedd0adac35dd5623d017c07aa7fbb991c9364335278b80f1a979d5141fb6cf6cc92849bc6ca5e3c24d25e75f828c0efd57214e37be92d32f2c2208527f20","p":"d6c4e5045697756c7a312d02c2289c25d40f9954261f7b5876214b6df109c738b76226b199bb7e33f8fc7ac1dcc316e1e7c78973951bfc6ff2e00cc987cd76fcfb0b8c0096b0b460fffac960ca4136c28f4bfb580de47cf7e7934c3985e3b3d943b77f06ef2af3ac3494fc3c6fc49810a63853862a02bb1c824a01b7fc688e4028527a58ad58c9d512922660db5d505bc263af293bc93bcd6d885a157579d7f52952236dd9d06a4fc3bc2247d21f1a70f5848eb0176513537c983f5a36737f01f82b44546e8e7f0fabc457e3de1d9c5dba96965b10a2a0580b0ad0f88179e10066107fb74314a07e6745863bc797b7002ebec0b000a98eb697414709ac17b401","q":"b1e370f6472c8754ccd75e99666ec8ef1fd748b748bbbc08503d82ce8055ab3b","g":"9a8269ab2e3b733a5242179d8f8ddb17ff93297d9eab00376db211a22b19c854dfa80166df2132cbc51fb224b0904abb22da2c7b7850f782124cb575b116f41ea7c4fc75b1d77525204cd7c23a15999004c23cdeb72359ee74e886a1dde7855ae05fe847447d0a68059002c3819a75dc7dcbb30e39efac36e07e2c404b7ca98b263b25fa314ba93c0625718bd489cea6d04ba4b0b7f156eeb4c56c44b50e4fb5bce9d7ae0d55b379225feb0214a04bed72f33e0664d290e7c840df3e2abb5e48189fa4e90646f1867db289c6560476799f7be8420a6dc01d078de437f280fff2d7ddf1248d56e1a54b933a41629d6c252983c58795105802d30d7bcd819cf6ef"}'  # NOQA


class TestMSISDN(TestCase):
    omxen_url = OMXEN_URL

    def test_all(self):
        # Discover
        self.discover()

        # Create a token
        self.register()

        # Use the MO flow 50% of the time and the MT flow the remaining
        if random.randint(0, 100) < PERCENTAGE_OF_MT_FLOW:
            # 1. Ask MSISDN validation
            resp = self.start_mt_flow()
            self.assertEqual(resp.status_code, 200,
                             "Start MT Flow failed: %s" % resp.content)
        else:
            # 2. Send SMS /sms/momt/verify hawkId
            resp = self.start_momt_flow()
            self.assertEqual(resp.status_code, 200,
                             "Start MOMT Flow failed: %s" % resp.content)

        # Poll omxen for the message
        message = self.read_message()

        # Get the message code
        if random.randint(0, 100) > PERCENTAGE_OF_WRONG_CODES:
            # 1. Try to validate a valid code
            self.incr_counter("try-right-code")
            resp = self.verify_code(message)
            if resp.status_code == 200:
                # If it was a valid code generate a certificate
                self.incr_counter("ask-for-certificate")
                self.sign_certificate()
            else:
                # If we didn't validate the code from the omxen
                # message it is probably because two test where using
                # the same MSISDN at the same time
                self.assertEquals(resp.status_code, 400,
                                  "Omxen collision failed: %s" % resp.content)

                self.incr_counter("omxen-message-collision")
        else:
            # 2. Try to validate a wrong code
            self.incr_counter("try-wrong-code")
            resp = self.verify_code()
            self.assertEquals(resp.status_code, 400,
                              "Try wrong code failed: %s" % resp.content)

        # Unregister
        self.unregister()

    def __get_random_msisdn(self):
        code = "%d" % random.randint(0, 999999999)
        code = code.zfill(9)
        return "+33%s" % code

    def discover(self):
        resp = self.session.post(
            self.server_url + '/discover',
            data=json.dumps({"mcc": "204"}),
            headers={'Content-type': 'application/json'}
        )
        self.assertEquals(resp.status_code, 200,
                          "Discover endpoint failed: %s" % resp.content)

    def register(self):
        resp = self.session.post(self.server_url + '/register')
        self.incr_counter("register")
        try:
            sessionToken = resp.json()['msisdnSessionToken']
        except ValueError:
            self.fail("No JSON has been returned: %s" % resp.content)
        except KeyError:
            self.fail("msisdnSessionToken not found in response: %s" %
                      resp.content)

        self.hawk_auth = HawkAuth(self.server_url, sessionToken)

    def start_mt_flow(self):
        self.msisdn = self.__get_random_msisdn()
        self.shortVerificationCode = \
            random.randint(0, 100) < PERCENTAGE_OF_SHORT_CODES

        self.incr_counter("mt-flow")

        return self.session.post(
            self.server_url + '/sms/mt/verify',
            data=json.dumps({
                "msisdn": self.msisdn,
                "shortVerification": self.shortVerificationCode
            }),
            headers={'Content-type': 'application/json'},
            auth=self.hawk_auth)

    def start_momt_flow(self):
        self.msisdn = self.__get_random_msisdn()
        self.shortVerificationCode = False

        self.incr_counter("momt-flow")

        # You don't need to be authenticated to revoke a token.
        return self.session.get(
            self.server_url + '/sms/momt/nexmo_callback',
            params={"msisdn": self.msisdn.lstrip("+"),
                    "text": "/sms/momt/verify %s" % self.hawk_auth.hawk_id})

    def read_message(self):
        resp = self.session.get(self.omxen_url + '/receive',
                                params={"to": self.msisdn.lstrip("+")})
        try:
            messages = resp.json()
            self.assertTrue(isinstance(messages, list),
                            "Wrong JSON from OMXEN: %s" % messages)
        except ValueError:
            print resp.content
            raise

        start_time = time.time()

        #  Poll on the omxen message list for this number
        while len(messages) < 1 and \
                time.time() - start_time < MAX_OMXEN_TIMEOUT:
            time.sleep(1)
            resp = self.session.get(self.omxen_url + '/receive',
                                    params={"to": self.msisdn.lstrip("+")})
            try:
                messages = resp.json()
                self.assertTrue(isinstance(messages, list),
                                "Wrong JSON from OMXEN: %s" % messages)
            except ValueError:
                print resp.content
                raise

        if len(messages) >= 1:
            return messages[0]["text"]

    def verify_code(self, message=None):
        # Extract the code from the message
        if message is None:
            # No message, build a fake code
            code = "%d" % random.randint(0, 999999)
            code = code.zfill(6)
        else:
            if len(message) == 64:
                # Long Verification code
                # The message is the code
                code = message
            else:
                # Short verification code, the code is the last word.
                code = message.split()[-1]
        return self.session.post(self.server_url + "/sms/verify_code",
                                 data=json.dumps({"code": code}),
                                 headers={'Content-type': 'application/json'},
                                 auth=self.hawk_auth)

    def sign_certificate(self):
        data = {
            'duration': 10,
            'publicKey': PUBLIC_KEY
        }
        resp = self.session.post(self.server_url + '/certificate/sign',
                                 data=json.dumps(data),
                                 headers={'Content-type': 'application/json'},
                                 auth=self.hawk_auth)
        self.assertEqual(resp.status_code, 200,
                         "Sign certificate failed: %s" % resp.content)

    def unregister(self):
        resp = self.session.post(self.server_url + '/unregister',
                                 headers={'Content-type': 'application/json'},
                                 auth=self.hawk_auth)
        self.incr_counter("unregister")
        self.assertEqual(resp.status_code, 200,
                         "Unregister failed: %s" % resp.content)


def HKDF_extract(salt, IKM, hashmod=hashlib.sha256):
    """HKDF-Extract; see RFC-5869 for the details."""
    if salt is None:
        salt = b"\x00" * hashmod().digest_size
    return hmac.new(salt, IKM, hashmod).digest()


def HKDF_expand(PRK, info, L, hashmod=hashlib.sha256):
    """HKDF-Expand; see RFC-5869 for the details."""
    digest_size = hashmod().digest_size
    N = int(math.ceil(L * 1.0 / digest_size))
    assert N <= 255
    T = b""
    output = []
    for i in xrange(1, N + 1):
        data = T + info + chr(i)
        T = hmac.new(PRK, data, hashmod).digest()
        output.append(T)
    return b"".join(output)[:L]


def HKDF(secret, salt, info, size, hashmod=hashlib.sha256):
    """HKDF-extract-and-expand as a single function."""
    PRK = HKDF_extract(salt, secret, hashmod)
    return HKDF_expand(PRK, info, size, hashmod)


class HawkAuth(AuthBase):
    def __init__(self, server_url, tokendata):
        hawk_session = tokendata.decode('hex')
        self.server_url = server_url
        keyInfo = 'identity.mozilla.com/picl/v1/sessionToken'
        keyMaterial = HKDF(hawk_session, "", keyInfo, 32*3)
        self.hawk_id = keyMaterial[:32].encode("hex")
        self.auth_key = keyMaterial[32:64].encode("hex")
        self.credentials = {
            'id': self.hawk_id,
            'key': self.auth_key,
            'algorithm': 'sha256'
        }

    def __call__(self, r):
        r.headers['Host'] = urlparse(self.server_url).netloc
        sender = mohawk.Sender(
            self.credentials,
            r.url,
            r.method,
            content=r.body or '',
            content_type=r.headers.get('Content-Type', '')
        )

        r.headers['Authorization'] = sender.request_header
        return r
