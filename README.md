MSISDN Gateway
==============

This is a PoC of an MSISDN Gateway server that takes a phone number an
register it using an SMS validation.

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
