How to contribute
=================

The process is quite common :

1. Create a new github issue to discuss the feature or bug you want to implement or fix.
2. You can implement it in a branch on the depot or on your fork.
3. Create a pull-request to ask for a review of your work.
4. After a reviewer gave you a r+, your pull-request will be merged into master.


Name your branch
----------------

Try to prefix your branch name with the ticket number.

i.e: ``425-sms-mo`` is better than ``sms-mo``


Merge a PR
----------

Make sure the commit message refs and closes related tickets.

It is better to let the reviewer merge your branch, if not, add
``r=ReviewerGithubLogin`` to the merge commit message.


ie: 

    git merge 425-sms-mo -m "Fix #425 — Implements the SMS MO protocol
    >
    >r=tarekziade"


Unit test
---------

A pull request must come with tests.
If it is a bug fix, make sure your test simulates the bug.

Travis will automatically test your branch.
Please wait for the test to be green before merging.


Release
-------

A release is made at the end of each milestone.

A milestone is a set of issue that need to be fixed all
together to meet some new server requirements.

For now each API.md version defined a new milestone.

We use [semver][1] to give a MAJOR.MINOR.PATCH version number.

Until the first release MAJOR version will be 0 because we don't know
what will be the final API.

The first production ready version will be 1.0.0


Contact developer
-----------------

If you have any questions you can reach us on the irc #media room
of the mozilla irc server.

[1]: http://www.semver.org/
