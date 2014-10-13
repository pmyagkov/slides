NPM_BIN=./node_modules/.bin

all:
	npm i && $(NPM_BIN)/gulp

watch:
	$(NPM_BIN)/gulp w

clean:
	$(NPM_BIN)/gulp clean

.PHONY: all clean watch
