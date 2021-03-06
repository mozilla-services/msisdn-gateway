SERVER_URL = https://msisdn-loadtest.stage.mozaws.net
OMXEN_URL = http://omxen.dev.mozaws.net

# Hackety-hack around OSX system python bustage.
# The need for this should go away with a future osx/xcode update.
ARCHFLAGS = -Wno-error=unused-command-line-argument-hard-error-in-future
INSTALL = ARCHFLAGS=$(ARCHFLAGS) ./venv/bin/pip install

.PHONY: build clean test bench megabench

# Build virtualenv, to ensure we have all the dependencies.
build:
	virtualenv --no-site-packages ./venv
	$(INSTALL) pexpect
	$(INSTALL) gevent
	$(INSTALL) git+git://github.com/mozilla-services/loads.git
	$(INSTALL) mohawk

install: build

# Clean all the things installed by `make build`.
clean:
	rm -rf ./venv *.pyc

# Run a single test from the venv machine, for sanity-checking.
test:
	OMXEN_URL=$(OMXEN_URL) ./venv/bin/loads-runner --config=./config/test.ini --server-url=$(SERVER_URL) loadtest.TestMSISDN.test_all

# Run a bench of 20 concurrent users from the local machine
bench:
	OMXEN_URL=$(OMXEN_URL) ./venv/bin/loads-runner --config=./config/bench.ini --server-url=$(SERVER_URL) loadtest.TestMSISDN.test_all

# Run a much bigger bench, by submitting to broker in AWS.
megabench:
	OMXEN_URL=$(OMXEN_URL) ./venv/bin/loads-runner --config=./config/megabench.ini --user-id=$(USER) --server-url=$(SERVER_URL) loadtest.TestMSISDN.test_all

# Purge any currently-running loadtest runs.
purge:
	./venv/bin/loads-runner --config=./config/megabench.ini --purge-broker
