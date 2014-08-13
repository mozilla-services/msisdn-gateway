VENV := $(shell echo $${VIRTUAL_ENV-.venv})
INSTALL_STAMP=$(VENV)/.install.stamp

install: $(INSTALL_STAMP)

$(INSTALL_STAMP):
	virtualenv $(VENV)
	$(VENV)/bin/pip install -r requirements.pip
	touch $(INSTALL_STAMP)

clean:
	rm -fr $(VENV)
