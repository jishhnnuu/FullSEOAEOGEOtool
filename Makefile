.PHONY: help install dev api worker web check test lint demo keygen migrate clean docker docs docs-check cf-build cf-preview cf-deploy

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
	@echo ""
	@echo "  make cf-preview run the Cloudflare Worker locally on :8788"
	@echo "  make cf-deploy  build and deploy that Worker"

$(VENV):
	python3 -m venv $(VENV)
	$(PIP) install --quiet --upgrade pip setuptools wheel

install: $(VENV)
	$(PIP) install -e ".[dev,extract,postgres]"
	npm install

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
	SEOOS_API_URL=http://localhost:8000 npm run dev

docs: $(VENV)
	$(PY) scripts/generate_reference.py
	$(PY) scripts/roster_to_ts.py
	$(PY) scripts/ads_to_ts.py

# Fails if the committed reference is stale. Run in CI so a change to a tool,
# check, agent or mission cannot land without its documentation.
docs-check: $(VENV)
	$(PY) scripts/generate_reference.py
	$(PY) scripts/roster_to_ts.py
	$(PY) scripts/ads_to_ts.py
	@git diff --quiet -- docs/reference apps/web/src/lib/roster.generated.ts apps/web/src/engine/ads.generated.ts || \
		(echo "Generated files are stale. Run 'make docs' and commit."; \
		 git diff --stat -- docs/reference apps/web/src/lib/roster.generated.ts apps/web/src/engine/ads.generated.ts; exit 1)

test: $(VENV)
	$(PY) -m pytest tests/ -q
	npm run test:engine

lint: $(VENV)
	$(VENV)/bin/ruff check packages tests scripts
	npm run typecheck
	# The D1 schema lives in TypeScript and is mirrored to .sql. Catch drift here
	# rather than when someone runs the migration by hand and gets an old schema.
	node scripts/d1-sql.mjs --check

docker:
	docker compose up --build

# --- the public Cloudflare deployment --------------------------------------
# One Worker serving the dashboard and the audit engine. Cloudflare Workers
# cannot host the Python service, so the Worker fetches and parses pages and
# the browser runs the analysis. See docs/DEPLOYMENT.md.

cf-build:
	npm run cf:build

cf-preview: cf-build
	npx wrangler dev --port 8788 --local

cf-deploy:
	npx wrangler deploy

clean:
	rm -rf var/*.db var/shots .pytest_cache apps/web/.next apps/web/.open-next .wrangler
	find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
