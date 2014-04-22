MSISDN Gateway
==============


This is a PoC of an MSISDN Gateway server that takes a phone number an
register it using an SMS validation.

It implements the proposal here : https://github.com/mozilla/fxa-auth-server/wiki/API-extensions-for-supporting-MSISDN-verification-in-FxA-auth-server

The API are discussed on the loop-dev mailing list at https://mail.mozilla.org/listinfo/loop-dev


Registration process flow
-------------------------

  1. The client make a ``/register`` request and receive a sessionToken.
  2. The server send a SMS to the MSISDN.
  3. The client ask for ``/verify_code`` with the sessionToken and the code and get a BrowserID certificate.
  4. If needed the client can also ask for a new code with ``/resend_code`` and its sessionToken.
  5. Finally the client can destroy its registration using ``/unregister`` and its sessionToken.

How to install?
---------------

You will need redis-server installed:

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

`development` is the environment by default.

    make runserver

this is equivalent to:

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
