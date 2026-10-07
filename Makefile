# Minimal gate for the StitchLAB changes in this fork. TurtleStitch itself is
# served as static JavaScript, so there is no setup or dev target: open
# index.html through any static file server.
#
# Node is pinned in .nvmrc (nvm use); the tests have no dependencies.

NODE ?= node

.PHONY: test lint check

test:
	$(NODE) --test test/

lint:
	$(NODE) --check stitchcode/turtleShepherd.js
	$(NODE) --check stitchcode/gui.js

check: lint test
