from urlparse import urlparse
import random
import json
import hmac
import hashlib
import math

import mohawk
from requests.auth import AuthBase

from loads.case import TestCase


class TestMSISDN(TestCase):

    def test_all(self):
        # Create a token
        self.register()

        # Once over two use MO or MT to ask for MSISDN validation
        if random.choice([True, False]):
            self.incr_counter("mt-flow")
            # 1. Ask MSISDN validation
            resp = self.start_mt_flow()
            self.assertEqual(resp.status_code, 200)
        else:
            self.incr_counter("momt-flow")
            # 2. Send SMS /sms/momt/verify hawkId
            resp = self.start_momt_flow()
            self.assertEqual(resp.status_code, 200)

        # Poll omxen for the message
        message = self.read_message()

        # Get the message code
        if random.choice([True, False, True]):
            self.incr_counter("try-good-code")
            # 1. Try to validate a wrong code
            resp = self.verify_code(message)
        else:
            self.incr_counter("try-wrong-code")
            # 2. Try to validate a valid code
            resp = self.verify_code()

        if resp.status_code == 200:
            self.incr_counter("ask-for-certificate")
            # If it did validate generate a certificate
            self.sign_certificate()

        # Unregister
        self.unregister()

    def register(self):
        resp = self.session.post(self.server_url + '/register')

        try:
            self.hawk_auth = HawkAuth(
                self.server_url,
                resp.json()['msisdnSessionToken'])
        except ValueError:
            print resp.body
            raise

    def start_mt_flow(self):
        self.msisdn = self.get_random_msisdn()
        self.shortVerificationCode = random.choice([True, False])
        return self.session.post(
            self.server_url + '/sms/mt/verify',
            data=json.dumps({
                "msisdn": self.msisdn,
                "shortVerification": self.shortVerificationCode
            }),
            headers={'Content-type': 'application/json'},
            auth=self.hawk_auth)

    def start_momt_flow(self):
        # You don't need to be authenticated to revoke a token.
        self.msisdn = self.get_random_msisdn()
        self.shortVerificationCode = False
        return self.get(
            self.server_url + '/sms/momt/nexmo_callback',
            params={"msisdn": self.msisdn.lstrip("+"),
                    "text": "/sms/momt/verify %s" % self.hawk_auth.hawk_id})

    def read_message(self):
        resp = self.session.get(self.omxen_url + '/receive',
                                params={"to": self.msisdn})
        try:
            messages = resp.json()
        except ValueError:
            print resp.body
            raise

        while len(messages) < 1:
            try:
                messages = resp.json()
            except ValueError:
                print resp.body
                raise

        return messages[0]["text"]

    def verify_code(self, message=None):
        if message is None:
            code = "%d" % random.randint(0, 999999)
            code = code.zfill(6)
        else:
            if len(message) == 64:
                code = message
            else:
                code = message.split()[-1]
        return self.session.post(self.server_url + "/sms/verify_code",
                                 {"code": code},
                                 auth=self.hawk_auth)

    def sign_certificate(self):
        resp = self.session.post(self.server_url + '/certificate/sign',
                                 auth=self.hawk_auth)
        self.assertEqual(resp.status_code, 200)

    def unregister(self):
        resp = self.session.post(self.server_url + '/unregister',
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
