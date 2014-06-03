MSISDN Gateway
==============

[![Build Status](https://travis-ci.org/mozilla-services/msisdn-gateway.svg?branch=master)](https://travis-ci.org/mozilla-services/msisdn-gateway)

This is a proof of concept of an MSISDN Gateway server that takes a phone number and
register it using an SMS validation mechanism.

[API docs](API.md)

[Mailing list](https://mail.mozilla.org/listinfo/loop-services-dev)

[Dummy client](https://github.com/ferjm/msisdn-verifier-client)


Registration process flow
-------------------------

  1. The client sends a request to ``/register``.

  -- The server chooses the verification process based on MSISDN, MCC and MNC
     codes and returns a session token and a verify endpoint.

  2. The client sends a request to ``/sms/verify`` (the verify endpoint).

  -- The server sends a SMS text message containing a pin code, and returns the
     number that was used to send it (the phone number of the server, useful
     for silent SMS catch)

  3. The client sends a request to verify the pin code (to ``/sms/verify_code``)
     with the session token and the pin code and gets back a BrowserID
     certificate.
  4. If needed, the client can also ask for a new pin code using the
     ``/sms/resend_code`` URL and its sessionToken.
  5. Finally the client can unregister itself using the ``/unregister`` URL
     and its sessionToken.


What is the needed stack?
-------------------------

<img src="http://www.gliffy.com/go/publish/image/5799498/L.png" />


How to install?
---------------

You will need to have redis-server installed:

### Linux

    apt-get install redis-server

### OS X

Assuming you have brew installed, use it to install redis:

    brew install redis

If you need to restart it (after configuration update):

    brew services restart redis

### All Platforms

Then clone the loop server and install its dependencies:

    git clone https://github.com/mozilla-services/msisdn-gateway.git
    cd msisdn-gateway && make install


How to run it?
--------------

You can create your configuration file in `config/{NODE_ENV}.json`

You need to generate the BrowserId keys by running `./bin/generate-keypair` and
add them to your configuration file.

`development` is the default environment.

    make runserver

is equivalent to:

    NODE_ENV=development make runserver


How to run the tests?
---------------------

    make test


Where to report bugs?
---------------------

You should report bugs/issues or feature requests via [Github Issues](https://github.com/mozilla-services/msisdn-gateway/issues)


License
-------

The MSISDN Gateway code is released under the terms of the
[Mozilla Public License v2.0](http://www.mozilla.org/MPL/2.0/). See the
`LICENSE` file at the root of the repository.
