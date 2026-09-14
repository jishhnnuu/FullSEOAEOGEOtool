"""Deterministic checks. No model involved, so results are reproducible and
free, and a client's audit does not change because a model had an off day."""

from seoos.analysis.checks.aeo import check_aeo, score_page_aeo
from seoos.analysis.checks.content import check_content, check_site_content
from seoos.analysis.checks.links import check_link_graph
from seoos.analysis.checks.schema import check_schema, validate_jsonld
from seoos.analysis.checks.technical import check_site_technical, check_technical

__all__ = [
    "check_technical", "check_site_technical", "check_content",
    "check_site_content", "check_schema", "validate_jsonld",
    "check_aeo", "score_page_aeo", "check_link_graph",
]
