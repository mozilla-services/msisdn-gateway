#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import requests
import sys
import time

from docopt import docopt
from requests_hawk import HawkAuth
from six.moves import input

from browserid.utils import decode_bytes, bundle_certs_and_assertion
from browserid import jwt
from browserid.tests.support import get_keypair

HELP = """This program helps you test a MSISDN Gateway server from the CLI.

Usage:
  roundTrip.py --host=<host> --mcc=<mcc> [--mnc=<mnc>] [--msisdn=<msisdn>] [--audience=<audience>]


Options:
  -h --help                  This help
  -H --host=<host>           The MobileID host
  -c --mcc=<mcc>             Mobile Country Code (three digit) ie: 214
  --mnc=<mnc>                Mobile Network Code (two or three digit) ie: 07
  -n --msisdn=<msisdn>       The MSISDN number you want to validate.
  -a, --audience=<audience>  The service provider audience


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
    try:
        r.raise_for_status()
    except:
        print(r.content)
        raise

    discover = r.json()

    # 1.1 Register
    url = "%s/register" % host
    r = requests.post(url, headers=headers)
    try:
        r.raise_for_status()
    except:
        print(r.content)
        raise

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
        try:
            r.raise_for_status()
        except:
            print(r.content)
            raise

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
    try:
        r.raise_for_status()
    except:
        print(r.content)
        raise

    # 6. Print out the certificate
    publicKey, privateKey = get_keypair("msisdn")
    url = "%s/certificate/sign" % host
    sign_args = {
        "publicKey": json.dumps(publicKey),
        "duration": 86400  # One day
    }
    r = requests.post(url, json.dumps(sign_args),
                      auth=hawk_auth, headers=headers)
    try:
        r.raise_for_status()
    except:
        print(r.content)
        raise

    sign = r.json()
    cert = sign["cert"]
    info = json.loads(decode_bytes(cert.split('.')[1]).decode("utf-8"))
    info["publicKey"] = "<stripped>"
    info["pubkey"] = "<stripped>"
    print("Verified: %s" % json.dumps(info, indent=2, sort_keys=True))

    # Build assertion
    if arguments["--audience"]:
        audience = arguments["--audience"]

        assertion = {
            "exp": int((time.time() + 60) * 1000),
            "aud": audience
        }

        assertion = bundle_certs_and_assertion(
            [cert], jwt.generate(assertion, privateKey)
        )

        print("""
    curl -X POST -D - \\
        -H 'Authorization: BROWSERID %s' \\
        -H 'Content-Type: application/json' -H 'Accept: application/json' \\
        -d '{\"simplePushURL\": \"http://httpbin.org/deny\"}' \\
        %s/registration\n""" % (assertion, audience))

        print("To validate the configuration of the service provider, you can "
              "run the curl command above.\n\n"
              "You should get a 200 OK status code with a Hawk-Session-Token "
              "header.\n\n")

        print("""If not, here are the error messages you can get:
  - "Certificate expired": you play too long with this curl command,
                           ask for a new certificate

  - "Invalid audience":    The Service Provider doesn't accept this audience
                           It can be either a misconfiguration on the server or
                           you trying the assertion to a wrong server.

  - "Issuer not trusted":  The MSISDN server that generate your certificate
                           is not trusted on this Service Provider.
                           It can be either a misconfiguration or
                           you trying the assertion to a wrong server.

  - Something else? Please make a PR to add it here.
""")


if __name__ == "__main__":
    main(sys.argv)
