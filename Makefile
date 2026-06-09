.PHONY: setup install dev build api web typecheck lint format clean test test-e2e test-all

setup: ## First-time setup: install deps and copy .env.example → .env
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example — fill in ANTHROPIC_API_KEY and OPENAI_API_KEY before running."; \
	else \
		echo ".env already exists — skipping copy."; \
	fi
	pnpm install

install: ## Install dependencies
	pnpm install

dev: ## Run API + web in parallel (Turborepo)
	pnpm dev

build: ## Build all packages
	pnpm build

api: ## Run only the NestJS API (port 3001)
	pnpm --filter @edgevanta/api dev

web: ## Run only the Next.js web app (port 3000)
	pnpm --filter @edgevanta/web dev

typecheck: ## Run TypeScript compiler check across all packages
	pnpm check-types

lint: ## Run ESLint across the monorepo
	pnpm lint

format: ## Format all files with Prettier
	pnpm format

test: ## Run unit tests
	pnpm test

test-e2e: ## Run E2E tests
	pnpm --filter @edgevanta/api test:e2e

test-all: ## Run unit + E2E tests
	pnpm test && pnpm --filter @edgevanta/api test:e2e

clean: ## Remove build artifacts and caches
	rm -rf .turbo node_modules apps/api/dist apps/api/node_modules \
		apps/web/.next apps/web/node_modules packages/types/node_modules

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
