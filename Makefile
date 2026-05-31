.PHONY: dev backend frontend install install-backend install-frontend

dev: ## Start both backend and frontend dev servers
	@echo "Starting backend (port 8000) and frontend (port 5173)..."
	@trap 'kill %1 %2 2>/dev/null; exit' INT; \
	  cd backend && .venv/bin/uvicorn main:app --reload --port 8000 & \
	  cd frontend && npm run dev & \
	  wait

backend: ## Start backend only
	cd backend && .venv/bin/uvicorn main:app --reload --port 8000

frontend: ## Start frontend only
	cd frontend && npm run dev

install: install-backend install-frontend ## Install all dependencies

install-backend: ## Install Python dependencies
	cd backend && pip install -r requirements.txt

install-frontend: ## Install Node dependencies
	cd frontend && npm install

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
