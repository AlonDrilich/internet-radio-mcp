# Security

Please report a vulnerability privately with GitHub's **Report a vulnerability** button on the
[Security tab](https://github.com/AlonDrilich/internet-radio-mcp/security/advisories/new) of this
repository, rather than in a public issue. Include the version (`internet-radio-mcp --version`), what you
did and what happened. You should get a first reply within a few days.

Scope notes: the server only makes HTTPS GET requests to the public Radio Browser API (or to the mirrors
set in `RADIO_BROWSER_MIRRORS`) and treats every directory field as untrusted input; the README's
"Untrusted data" section describes what it cleans and the limits of that. Reports about station data
itself (a misleading name, a dead stream) belong to [radio-browser.info](https://www.radio-browser.info).
