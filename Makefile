.PHONY: help install dev api worker web check test lint demo keygen migrate clean docker docs docs-check

VENV := .venv
PY   := $(VENV)/bin/python
PIP  := $(VENV)/bin/pip
export PYTHONPATH := $(CURDIR)/packages

help:
	@echo "SEO OS"
	@echo ""
	@echo "  make install    create the virtualenv and install everything"
	@echo "  make keygen     generate the encryption keys for your .env"
	@echo "  make demo       seed a tenant and audit a real site (no API keys needed)"
	@echo "  make api        run the API on :8000"
	@echo "  make worker     run the scheduler and mission worker"
	@echo "  make web        run the dashboard on :3000"
	@echo "  make check      validate agents, missions and tools"
	@echo "  make test       run the test suite"
	@echo "  make docs       regenerate the reference documentation"
	@echo "  make docker     bring the whole stack up with Postgres"

$(VENV):
	python3 -m venv $(VENV)
	$(PIP) install --quiet --upgrade pip setuptools wheel

install: $(VENV)
	$(PIP) install -e ".[dev,extract,postgres]"
	cd apps/web && npm install

keygen: $(VENV)
	@$(PY) -m seoos.cli keygen

migrate: $(VENV)
	$(PY) -m seoos.cli migrate

check: $(VENV)
	$(PY) -m seoos.cli check

demo: $(VENV)
	$(PY) -m seoos.cli demo

api: $(VENV)
	$(PY) -m seoos.cli serve --reload

worker: $(VENV)
	$(PY) -m seoos.cli worker

web:
	cd apps/web && SEOOS_API_URL=http://localhost:8000 npm run dev

docs: $(VENV)
	$(PY) scripts/generate_reference.py

# Fails if the committed reference is stale. Run in CI so a change to a tool,
# check, agent or mission cannot land without its documentation.
docs-check: $(VENV)
	$(PY) scripts/generate_reference.py
	@git diff --quiet -- docs/reference || \
		(echo "docs/reference is stale. Run 'make docs' and commit."; git diff --stat -- docs/reference; exit 1)

test: $(VENV)
	$(PY) -m pytest tests/ -q

lint: $(VENV)
	$(VENV)/bin/ruff check packages tests
	cd apps/web && npx tsc --noEmit

docker:
	docker compose up --build

clean:
	rm -rf var/*.db var/shots .pytest_cache apps/web/.next
	find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
