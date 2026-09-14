"""SEO OS: an autonomous search growth platform.

The package is organised in layers, lowest first:

    core/         configuration, database, security, tenancy, errors
    llm/          provider-agnostic model access (no vendor lock-in)
    tools/        the capabilities an agent may invoke
    connectors/   outbound integrations (search consoles, CMS, social, data)
    brand/        the brand brain: assets in, voice and fact ledger out
    analysis/     deterministic SEO/AEO/GEO analysers
    agents/       the agency roster and the runtime that executes it
    missions/     declarative workflows that chain agents into outcomes
    api/          the HTTP surface the dashboard and webhooks talk to
"""

__version__ = "0.1.0"
