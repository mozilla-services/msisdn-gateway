# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

NODE_LOCAL_BIN=./node_modules/.bin

TMPDIR ?= "/tmp"

.PHONY: test
test: lint cover-mocha spaceleft

install:
	gem install fake_dynamo
	@npm install

.PHONY: lint
lint: jshint

clean:
	rm -rf .venv node_modules coverage lib-cov html-report

.PHONY: cover-mocha
cover-mocha:
	@fake_dynamo --db $(TMPDIR)/fake_dynamo.db --pid $(TMPDIR)/fake_dynamo.pid -D > /dev/null
	@env NODE_ENV=test $(NODE_LOCAL_BIN)/istanbul cover \
			 $(NODE_LOCAL_BIN)/_mocha -- --reporter spec test/*
	@-kill `cat $(TMPDIR)/fake_dynamo.pid`
	@-rm -f $(TMPDIR)/fake_dynamo.db $(TMPDIR)/fake_dynamo.pid
	@sleep 2
	@echo aim your browser at coverage/lcov-report/index.html for details

.PHONY: jshint
jshint:
	@$(NODE_LOCAL_BIN)/jshint test msisdn-gateway/*.js

.PHONY: mocha
mocha:
	@fake_dynamo --db $(TMPDIR)/fake_dynamo.db --pid $(TMPDIR)/fake_dynamo.pid -D > /dev/null
	@env NODE_ENV=test ./node_modules/mocha/bin/mocha test/* --reporter spec
	@-kill `cat $(TMPDIR)/fake_dynamo.pid`
	@-rm -f $(TMPDIR)/fake_dynamo.db $(TMPDIR)/fake_dynamo.pid
	@sleep 2

.PHONY: spaceleft
spaceleft:
	if which grin 2>&1 >/dev/null; \
	then \
	  grin " $$" msisdn-gateway/ test/ config/; \
	fi

.PHONY: runserver
runserver:
	@env NODE_ENV=${NODE_ENV} PORT=5000 \
		node msisdn-gateway/index.js

.PHONY: messages
messages:
	./node_modules/i18n-abide/node_modules/.bin/jsxgettext \
	    --join-existing \
	    -L javascript \
	    --output-dir=./locale/templates/LC_MESSAGES \
	    --from-code=utf-8 \
	    --output=messages.pot msisdn-gateway/index.js
	for l in `ls ./locale | grep -v templates | grep -v README.md`; do \
        mkdir -p locale/$$l/LC_MESSAGES/; \
        msginit --input=./locale/templates/LC_MESSAGES/messages.pot \
            --output-file=./locale/$$l/LC_MESSAGES/messages.po \
            -l $$l; \
    done

.PHONY: compile-messages
compile-messages:
	./node_modules/.bin/compile-json locale app/i18n
