# ==============================================================================
# Kwipu Makefile
# Standard development, build, test, and container orchestration tasks.
# ==============================================================================

.PHONY: help install dev test lint build docker-up docker-down sync-knowledge clean

PYTHON ?= .venv/bin/python
PYTEST ?= .venv/bin/pytest
NPM ?= npm

help: ## Show available make targets and commands
	@echo "Kwipu Development & Operations Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

install: ## Install backend Python venv and frontend npm dependencies
	@echo "--> Setting up Python virtual environment and dependencies..."
	python3.12 -m venv .venv
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r bridge/requirements.txt
	@echo "--> Installing frontend dependencies..."
	$(NPM) --prefix frontend ci

dev: ## Start backend API bridge and frontend Vite server concurrently
	@echo "--> Starting Kwipu Development Server..."
	@if [ -f .env ]; then export $$(cat .env | grep -v "^#" | xargs); fi; 	trap 'kill 0' EXIT; 	$(PYTHON) -m bridge & 	$(NPM) --prefix frontend run dev & 	wait

dev-terminal: ## Start terminal-only indexer and interactive CLI
	@echo "--> Starting Kwipu Terminal CLI..."
	@if [ -f .env ]; then export $$(cat .env | grep -v "^#" | xargs); fi; 	$(PYTHON) geode_graph.py --fast

test: ## Run complete Python test suite
	@echo "--> Running pytest suite..."
	PYTHONPATH=. $(PYTEST) -v

test-frontend: ## Run frontend TypeScript typecheck and build check
	@echo "--> Testing frontend build..."
	$(NPM) --prefix frontend run build

build: ## Compile frontend static assets into dist/
	@echo "--> Building frontend production bundle..."
	$(NPM) --prefix frontend run build

docker-up: ## Build and start Docker container stack
	@echo "--> Starting Kwipu via Docker Compose..."
	docker compose up -d --build

docker-down: ## Stop and remove Docker containers
	@echo "--> Stopping Kwipu Docker Compose..."
	docker compose down

sync-knowledge: ## Ingest and re-index knowledge documents into property graph
	@echo "--> Re-indexing property graph..."
	PYTHONPATH=. $(PYTHON) -c 'import geode_graph; geode_graph._init_llm(); rag = geode_graph.WritHerGraphRAG(build_if_missing=True); print("Graph synchronized successfully.")'

clean: ## Remove caches, build artifacts, and temporary storage
	@echo "--> Cleaning cache and build files..."
	rm -rf frontend/dist __pycache__ */__pycache__ .pytest_cache
