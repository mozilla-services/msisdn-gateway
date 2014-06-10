import hashlib
import hmac
import json
import math
import random
import time
from urlparse import urlparse

import mohawk
from requests.auth import AuthBase

from loads.case import TestCase

PERCENTAGE_OF_MT_FLOW = 50  # Remining are MOMT flows
PERCENTAGE_OF_WRONG_CODES = 34  # Remining are valid ones.
PERCENTAGE_OF_SHORT_CODES = 50  # Remining are right ones.
MAX_OXMEN_TIMEOUT = 10  # Seconds to poll from oxmen.


class TestMSISDN(TestCase):
    omxen_url = "http://ec2-54-203-73-122.us-west-2.compute.amazonaws.com"

    def test_all(self):
        # Create a token
        self.register()

        # Use the MO flow 50% of the time and the MT flow the remaining
        if random.randint(0, 100) < PERCENTAGE_OF_MT_FLOW:
            # 1. Ask MSISDN validation
            resp = self.start_mt_flow()
            self.assertEqual(resp.status_code, 200)
        else:
            # 2. Send SMS /sms/momt/verify hawkId
            resp = self.start_momt_flow()
            self.assertEqual(resp.status_code, 200)

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
                # If we didn't validate the code from the oxmen
                # message it is probably because two test where using
                # the same MSISDN at the same time
                self.incr_counter("oxmen-message-collision")
        else:
            # 2. Try to validate a wrong code
            self.incr_counter("try-wrong-code")
            resp = self.verify_code()
            self.assertEquals(resp.status_code, 400)

        # Unregister
        self.unregister()

    def __get_random_msisdn(self):
        code = "%d" % random.randint(0, 999999999)
        code = code.zfill(9)
        return "+33%s" % code

    def register(self):
        resp = self.session.post(self.server_url + '/register')
        try:
            sessionToken = resp.json()['msisdnSessionToken']
            print sessionToken
        except:
            print resp.body
            raise

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
            self.assertIsInstance(messages, list)
        except ValueError:
            print resp.body
            raise

        start_time = time.time()

        #  Poll on the omxen message list for this number
        while len(messages) < 1 and \
                time.time() - start_time < MAX_OXMEN_TIMEOUT:
            try:
                messages = resp.json()
                self.assertIsInstance(messages, list)
            except ValueError:
                print resp.body
                raise

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
                                 {"code": code},
                                 headers={'Content-type': 'application/json'},
                                 auth=self.hawk_auth)

    def sign_certificate(self):
        resp = self.session.post(self.server_url + '/certificate/sign',
                                 headers={'Content-type': 'application/json'},
                                 auth=self.hawk_auth)
        self.assertEqual(resp.status_code, 200)

    def unregister(self):
        resp = self.session.post(self.server_url + '/unregister',
                                 headers={'Content-type': 'application/json'},
                                 auth=self.hawk_auth)
        self.assertEqual(resp.status_code, 200)


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
