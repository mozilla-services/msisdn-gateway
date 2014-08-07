# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

NODE_LOCAL_BIN = ./node_modules/.bin
FAKE_DYNAMO = $$(which ~/.gem/ruby/*/bin/fake_dynamo fake_dynamo)

TMPDIR ?= /tmp

.PHONY: test
test: lint cover-mocha spaceleft

install:
	@if [ -z "$(FAKE_DYNAMO)" ]; then echo "Installing fake_dynamo..."; gem install --user-install fake_dynamo; fi
	@npm install

.PHONY: lint
lint: jshint

clean:
	rm -rf .venv node_modules coverage lib-cov html-report

.PHONY: cover-mocha
cover-mocha:
	@$(FAKE_DYNAMO) --db $(TMPDIR)/fake_dynamo.db --pid $(TMPDIR)/fake_dynamo.pid -D > /dev/null
	@NODE_ENV=test $(NODE_LOCAL_BIN)/istanbul cover \
		$(NODE_LOCAL_BIN)/_mocha -- --reporter spec test/*; \
		EXIT_CODE=$$?; kill `cat $(TMPDIR)/fake_dynamo.pid`; \
		rm -f $(TMPDIR)/fake_dynamo.db $(TMPDIR)/fake_dynamo.pid; \
		sleep 2; exit $$EXIT_CODE
	@echo aim your browser at coverage/lcov-report/index.html for details

.PHONY: jshint
jshint:
	@$(NODE_LOCAL_BIN)/jshint test/*.js msisdn-gateway/*.js msisdn-gateway/*/*.js tools/*.js

.PHONY: mocha
mocha:
	@$(FAKE_DYNAMO) --db $(TMPDIR)/fake_dynamo.db --pid $(TMPDIR)/fake_dynamo.pid -D > /dev/null
	@NODE_ENV=test ./node_modules/mocha/bin/mocha test/* --reporter spec; \
		EXIT_CODE=$$?; kill `cat $(TMPDIR)/fake_dynamo.pid`; \
		rm -f $(TMPDIR)/fake_dynamo.db $(TMPDIR)/fake_dynamo.pid; \
		sleep 2; exit $$EXIT_CODE

.PHONY: spaceleft
spaceleft:
	@if which grin 2>&1 >/dev/null; \
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
	mkdir -p app/i18n
	./node_modules/.bin/compile-json locale app/i18n

.PHONY: update-l10n
update-l10n: update-l10n-git compile-messages

.PHONY: update-l10n-git
update-l10n-git:
	@if [ '$(NOVERIFY)' = '' ]; then \
	    echo "WARNING all update made in locale/* will be overridden by this command. CTRL-C to quit"; \
	    read toot; \
	fi
	@if [ ! -d $(TMPDIR)/msisdn-gateway-l10n ]; then \
	    echo "Cloning https://github.com/mozilla-services/msisdn-gateway-l10n.git"; \
	    git clone https://github.com/mozilla-services/msisdn-gateway-l10n.git $(TMPDIR)/msisdn-gateway-l10n; \
	else \
	    echo "Updating https://github.com/mozilla-services/msisdn-gateway-l10n.git"; \
	    cd $(TMPDIR)/msisdn-gateway-l10n; \
	      git checkout master; \
	      git pull origin master; \
	fi
	@mv ./locale/README.md /tmp/README.save
	@echo "Sync locales"
	cp -fr $(TMPDIR)/msisdn-gateway-l10n/locale/ .
	@mv /tmp/README.save locale/README.md


.PHONY: circus
circus:
	circusd circus/msisdn-gateway.ini
