SHELL := /bin/sh
.DEFAULT_GOAL := help

-include .env
export

API_PORT ?= 4000
WEB_PORT ?= 4173

.PHONY: help install env require-db-url require-db-client db-ping db-create migrate migrate-down migrate-status \
        migrate-create dev dev-api dev-web build start start-api preview-web icons \
        lint typecheck test test-watch format format-check verify clean

help:
	@echo "SplitLedger — run the stack without Docker."
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Reads .env when present. Migrations and the API need DATABASE_URL."

install: ## Install workspace dependencies
	pnpm install

env: ## Create .env from .env.example when missing
	@test -f .env && echo ".env already exists" || { cp .env.example .env && echo "created .env — edit DATABASE_URL and the JWT secrets"; }

require-db-url:
	@test -n "$(DATABASE_URL)" || { echo "DATABASE_URL is not set. Run 'make env' and edit .env."; exit 1; }

require-db-client:
	@command -v psql >/dev/null 2>&1 || { echo "psql not found. Install the Postgres client tools."; exit 1; }

db-ping: require-db-url require-db-client ## Check that DATABASE_URL is reachable
	@psql "$(DATABASE_URL)" -tAc "select version()"

db-create: require-db-url require-db-client ## Create the database named in DATABASE_URL
	@psql "$(DATABASE_URL)" -tAc "select 1" >/dev/null 2>&1 \
		&& echo "database already reachable" \
		|| createdb "$(DATABASE_URL)"

migrate: require-db-url ## Apply all pending migrations
	pnpm --filter api migrate up

migrate-down: require-db-url ## Roll back the most recent migration
	pnpm --filter api migrate down

migrate-status: require-db-url ## Show applied and pending migrations
	pnpm --filter api migrate status

migrate-create: require-db-url ## Scaffold a migration: make migrate-create name=add-thing
	@test -n "$(name)" || { echo "usage: make migrate-create name=<migration-name>"; exit 1; }
	pnpm --filter api migrate create $(name)

dev: ## Run api + web dev servers together
	pnpm dev

dev-api: ## Run the API dev server (watch mode)
	pnpm --filter api dev

dev-web: ## Run the web dev server
	pnpm --filter web dev

icons: ## Generate the PWA icons
	pnpm --filter web icons

build: ## Build the API bundle and the web app
	pnpm build

preview-web: ## Serve the built web app locally
	pnpm --filter web preview --port $(WEB_PORT)

start-api: ## Run the built API
	pnpm --filter api start

start: ## Run the built API and the built web app together
	@test -f apps/api/dist/index.js || { echo "apps/api/dist/index.js missing — run 'make build' first."; exit 1; }
	@echo "api → http://localhost:$(API_PORT)    web → http://localhost:$(WEB_PORT)"
	@pnpm --filter web preview --port $(WEB_PORT) & \
	web_pid=$$!; \
	trap 'kill $$web_pid 2>/dev/null' EXIT INT TERM; \
	pnpm --filter api start

lint: ## Lint every package
	pnpm lint

typecheck: ## Type-check every package
	pnpm typecheck

test: ## Run every test suite
	pnpm test

test-watch: ## Run test suites in watch mode
	pnpm -r test:watch

format: ## Format with Prettier
	pnpm format

format-check: ## Check formatting without writing
	pnpm format:check

verify: lint typecheck test ## Lint, type-check and test (run before declaring done)

clean: ## Remove build output
	rm -rf apps/api/dist apps/web/dist apps/web/.vite coverage
	@echo "removed build output"
