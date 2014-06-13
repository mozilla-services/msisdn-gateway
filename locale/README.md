# l10n

This directory contains translated strings for all supported
locales. Strings are extracted using a gettext compatible extractor,
generating `PO` template files.

* Once you are done with the content you worked on, you can copy the
  files over to a separate repository
  (i.e. [msisdn-gateway-i10n](https://github.com/mozilla-services/msisdn-gateway-l10n))
  and make a pull-request from your own fork. See **Updating the l10n
  repo** below.

        cp -r locale/templates/ ../msisdn-gateway-l10n/locale/templates/


## Required tools

### Mac OS X

To leverage `scripts/merge_po.sh` you need to have a few tools
installed through [brew](http://brew.sh/).

Once brew installed, run:

    brew install translate-toolkit
    brew install gettext

The script `msgmerge` is part of gettext. If you have problem with
your path, you can adjust manually your $PATH environment.

    export PATH=/usr/local/Cellar/gettext/VERSION/bin/:$PATH

Adjust the path at `VERSION` to the version brew installed for you and
running `scripts/merge_po.sh` should work.


## Adding new strings

If you add a new string to the app or server, you'll need to wrap it
in a `gettext` call so it can be extracted. In a mustache template,
that will look like `{{#t}}My new string{{/t}}` and in a JavaScript it
will look like `t("My new string")` (`t` is an alias for `gettext`).

After you've added new strings to source, you'll need to extract them
and update the `.pot` files, using the Makefile:

    $ make messages


## Updating the l10n repo

After extracting new strings, or editing content, you'll have to
update the l10n repo so that localizers participate in translation.

First, check out the l10n repo from github:

  git clone https://github.com/mozilla-services/msisdn-gateway-l10n.git

Then copy the .pot files to that repo:

  cp -r locale/templates/ ../msisdn-gateway-l10n/locale/templates/

Then run `merge_po.sh` from within msisdn-gateway-l10n:

```
./scripts/merge_po.sh locale
```

Commit the merged .po files to master and enjoy.


## Updating translations

Translators will update the `.po` files in the l10n repo, which are
downloaded as a bower dependency. To convert the new translations into
JSON for the app to use, run:

    make compile-messages

The JSON is not included under version control– they're regenerated on
each deployment.
