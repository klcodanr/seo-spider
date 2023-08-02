
build:
	npm run lint
	npm run test
	npm run docs
	npm ci

install: build
	npm link
