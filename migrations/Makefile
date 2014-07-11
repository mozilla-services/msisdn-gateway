VENV := $(shell echo $${VIRTUAL_ENV-var/venv})
ROOT_DIR = $(shell pwd)
BIN_DIR = $(VENV)/bin
PIP = $(BIN_DIR)/pip
TRANSMUTE = $(BIN_DIR)/transmute

.PHONY: install forward backward

install:
	virtualenv $(VENV)
	$(PIP) install "git+https://github.com/mozilla-services/transmutator.git"

forward:
	$(TRANSMUTE)
