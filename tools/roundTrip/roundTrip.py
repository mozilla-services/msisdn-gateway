# -*- coding: utf-8 -*-
import base64
import json
import requests
import sys

from docopt import docopt
from requests_hawk import HawkAuth
from six import text_type
from six.moves import input

HELP = """This program helps you test a MSISDN Gateway server from the CLI.

Usage:
  roundTrip.py --host=<host> --mcc=<mcc> [--mnc=<mnc>] [--msisdn=<msisdn>]


Options:
  -h --help             This help
  -H --host=<host>      The MobileID host
  -c --mcc=<mcc>        Mobile Country Code (three digit) ie: 214
  --mnc=<mnc>           Mobile Network Code (two or three digit) ie: 07
  -n --msisdn=<msisdn>  The MSISDN number you want to validate.


Example:
  roundTrip.py -H https://msisdn.services.mozilla.com -c 208 -n +33623456789


Some usefull Mobile Country Codes (MCC):
  - 204  Netherland
  - 208  France
  - 214  Spain
  - 235  United Kingdom
  - 250  Russia
  - 262  Germany
  - 302  Canada
  - 310  USA (310 to 316 actually)
  - 454  China
  - 505  Australia
"""

PUBLIC_KEY = '{"algorithm":"DS","y":"2bb69e89652d97315f156852c5d1a36c7ebf0fb991a3f812e55c804ca8fa8a09e6f1880de99fcaf4f5417a78a88591679219acda438f9ef4d5afb9d0ae20216414822c6187ec4f180eae6f1f2d2a0f55095e24141c8a5f12344ce4d6319042c168c962de1029a9ac1a528da2d27e4f9550b7c203572a034f077480d9f6e3ef3968902f7547a7374c5e7475dcc81002af3308d09ace22124719a83451cbd872403d6f72cf0b13b5ae0c092a3bf0daf8a26df7d618bc731306ccfbe431c9a30206327bedd0adac35dd5623d017c07aa7fbb991c9364335278b80f1a979d5141fb6cf6cc92849bc6ca5e3c24d25e75f828c0efd57214e37be92d32f2c2208527f20","p":"d6c4e5045697756c7a312d02c2289c25d40f9954261f7b5876214b6df109c738b76226b199bb7e33f8fc7ac1dcc316e1e7c78973951bfc6ff2e00cc987cd76fcfb0b8c0096b0b460fffac960ca4136c28f4bfb580de47cf7e7934c3985e3b3d943b77f06ef2af3ac3494fc3c6fc49810a63853862a02bb1c824a01b7fc688e4028527a58ad58c9d512922660db5d505bc263af293bc93bcd6d885a157579d7f52952236dd9d06a4fc3bc2247d21f1a70f5848eb0176513537c983f5a36737f01f82b44546e8e7f0fabc457e3de1d9c5dba96965b10a2a0580b0ad0f88179e10066107fb74314a07e6745863bc797b7002ebec0b000a98eb697414709ac17b401","q":"b1e370f6472c8754ccd75e99666ec8ef1fd748b748bbbc08503d82ce8055ab3b","g":"9a8269ab2e3b733a5242179d8f8ddb17ff93297d9eab00376db211a22b19c854dfa80166df2132cbc51fb224b0904abb22da2c7b7850f782124cb575b116f41ea7c4fc75b1d77525204cd7c23a15999004c23cdeb72359ee74e886a1dde7855ae05fe847447d0a68059002c3819a75dc7dcbb30e39efac36e07e2c404b7ca98b263b25fa314ba93c0625718bd489cea6d04ba4b0b7f156eeb4c56c44b50e4fb5bce9d7ae0d55b379225feb0214a04bed72f33e0664d290e7c840df3e2abb5e48189fa4e90646f1867db289c6560476799f7be8420a6dc01d078de437f280fff2d7ddf1248d56e1a54b933a41629d6c252983c58795105802d30d7bcd819cf6ef"}'  # NOQA


def main(args):
    arguments = docopt(HELP)
    host = arguments["--host"]
    headers = {'content-type': 'application/json'}

    # 1. Start the discover
    url = "%s/discover" % host
    discover_args = {"mcc": arguments["--mcc"], "roaming": False}
    if arguments["--mnc"] is not None:
        discover_args["mnc"] = arguments["--mnc"]
    if arguments["--msisdn"] is not None:
        discover_args["msisdn"] = arguments["--msisdn"]

    r = requests.post(url, json.dumps(discover_args), headers=headers)
    r.raise_for_status()
    discover = r.json()

    # 1.1 Register
    url = "%s/register" % host
    r = requests.post(url, headers=headers)
    r.raise_for_status()
    register = r.json()
    hawk_auth = HawkAuth(hawk_session=register["msisdnSessionToken"],
                         server_url=host)
    hawkId = hawk_auth.credentials["id"]

    # 2. If MT Flow
    if discover['verificationMethods'][0] == "sms/mt":
        # 2.1 If no MSISDN, ask the MSISDN
        if arguments["--msisdn"] is None:
            msisdn = input("Please enter your MSISDN number (ie +123456789): ")
        else:
            msisdn = arguments["--msisdn"]

        # 2.2 Start the registration
        print("MT Flow for %s" % msisdn)
        url = "%s/sms/mt/verify" % host
        verify_args = {
            "msisdn": msisdn,
            "mcc": discover_args["mcc"],
            "shortVerificationCode": True
        }
        r = requests.post(url, json.dumps(verify_args),
                          auth=hawk_auth, headers=headers)
        r.raise_for_status()

    # 3. If MOMT Flow
    else:
        print("MOMT Flow")
        # 3.1 Give the Number and HawkId
        moVerifier = discover['verificationDetails']["sms/momt"]["moVerifier"]
        print("Please send the following message to %s:" % moVerifier)
        print("\n\tSMS %s\n" % hawkId.decode("ascii"))

    # 4. Ask for the code
    code = input(
        "Please enter the code that you will get by SMS: "
    )

    # 5. Verify the code
    url = "%s/sms/verify_code" % host
    r = requests.post(url, json.dumps({"code": code.strip()}),
                      auth=hawk_auth, headers=headers)
    r.raise_for_status()

    # 6. Print out the certificate
    url = "%s/certificate/sign" % host
    sign_args = {
        "publicKey": PUBLIC_KEY,
        "duration": 3600
    }
    r = requests.post(url, json.dumps(sign_args),
                      auth=hawk_auth, headers=headers)
    r.raise_for_status()
    sign = r.json()
    cert = sign["cert"]
    info = json.loads(decode_bytes(cert.split('.')[1]).decode("utf-8"))
    info["publicKey"] = "<stripped>"
    info["pubkey"] = "<stripped>"
    print("Verified: %s" % json.dumps(info, indent=2, sort_keys=True))


def decode_bytes(value):
    """Decode BrowserID's base64 encoding format.

    BrowserID likes to strip padding characters off of base64-encoded strings,
    meaning we can't use the stdlib routines to decode them directly.  This
    is a simple wrapper that adds the padding back in.

    If the value is not correctly encoded, ValueError will be raised.
    """
    if isinstance(value, text_type):
        value = value.encode("ascii")
    pad = len(value) % 4
    if pad == 2:
        value += b"=="
    elif pad == 3:
        value += b"="
    elif pad != 0:
        raise ValueError("incorrect b64 encoding")
    try:
        return base64.urlsafe_b64decode(value)
    except TypeError as e:
        raise ValueError(text_type(e))


if __name__ == "__main__":
    main(sys.argv)
