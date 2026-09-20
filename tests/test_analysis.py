"""The deterministic analysis layer: parsing, checks, scoring."""

from __future__ import annotations

import pytest
from seoos.analysis.checks.aeo import blocked_ai_crawlers, build_llms_txt, score_page_aeo
from seoos.analysis.checks.content import ai_pattern_score, readability
from seoos.analysis.checks.links import LinkGraph
from seoos.analysis.checks.schema import generate_jsonld, validate_jsonld
from seoos.analysis.findings import CATALOG, FindingDraft
from seoos.analysis.http import validate_url
from seoos.analysis.parser import parse_html
from seoos.analysis.scoring import authority_score, expected_ctr, health_score, opportunity_score
from seoos.core.errors import ValidationFailed

GOOD_PAGE = """
<html lang="en"><head>
  <title>How Long Does a Dental Implant Take?</title>
  <meta name="description" content="Most implants take four to six months end to end. Here is the timeline.">
  <link rel="canonical" href="https://clinic.test/implant-timeline">
  <meta name="viewport" content="width=device-width">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Implant timeline","author":{"@type":"Person","name":"Dr Sarah Webb"},"datePublished":"2026-01-04"}</script>
</head><body><main>
  <h1>How Long Does a Dental Implant Take?</h1>
  <p>A dental implant is a titanium post placed in the jaw, and the full process takes four to six months for most patients. The wait is healing time, not appointment time.</p>
  <h2>What happens at each stage?</h2>
  <ul><li>Consultation</li><li>Placement</li><li>Healing</li></ul>
  <p>About 95% of implants integrate successfully within six months.</p>
  <table><tr><th>Stage</th><th>Weeks</th></tr><tr><td>Healing</td><td>12</td></tr></table>
  <a href="/pricing">implant pricing</a>
  <img src="/x.webp" alt="A dental implant diagram" width="600" height="400">
</main></body></html>
"""


class TestParser:
    def test_extracts_core_elements(self):
        s = parse_html(GOOD_PAGE, "https://clinic.test/implant-timeline")
        assert s.title == "How Long Does a Dental Implant Take?"
        assert s.h1 == ["How Long Does a Dental Implant Take?"]
        assert s.canonical == "https://clinic.test/implant-timeline"
        assert "Article" in s.schema_types
        assert s.lang == "en"
        assert s.is_indexable

    def test_separates_internal_and_external_links(self):
        html = '<a href="/a">in</a><a href="https://other.test/b">out</a>'
        s = parse_html(html, "https://clinic.test/p")
        assert len(s.internal_links) == 1
        assert len(s.external_links) == 1

    def test_detects_questions_definitions_and_stats(self):
        s = parse_html(GOOD_PAGE, "https://clinic.test/p")
        assert s.question_headings
        assert s.definition_sentences
        assert s.stat_sentences

    def test_noindex_is_respected(self):
        s = parse_html('<meta name="robots" content="noindex, follow">', "https://x.test/")
        assert not s.is_indexable

    def test_survives_broken_jsonld(self):
        s = parse_html(
            '<script type="application/ld+json">{not json</script>', "https://x.test/"
        )
        assert s.jsonld and "@error" in s.jsonld[0]


class TestAeo:
    def test_scores_a_well_structured_page_highly(self):
        s = parse_html(GOOD_PAGE, "https://clinic.test/p")
        score = score_page_aeo(s)
        assert score["score"] > 55
        assert score["direct_answer"] > 0.5
        assert score["citable_facts"] > 0

    def test_scores_a_vague_page_poorly(self):
        vague = "<main><h1>Dental Services</h1><p>We offer many services.</p></main>"
        assert score_page_aeo(parse_html(vague, "https://x.test/"))["score"] < 40

    @pytest.mark.parametrize(
        "robots,expected",
        [
            ("User-agent: GPTBot\nDisallow: /", "GPTBot"),
            ("User-agent: *\nDisallow: /", "PerplexityBot"),
            ("User-agent: *\nDisallow: /admin/", None),
            ("", None),
        ],
    )
    def test_detects_blocked_crawlers(self, robots, expected):
        blocked = blocked_ai_crawlers(robots)
        if expected:
            assert expected in blocked
        else:
            assert not blocked

    def test_builds_llms_txt(self):
        out = build_llms_txt(
            "Clinic", "A dental practice",
            {"Guides": [{"title": "Implants", "url": "/implants", "summary": "Timeline"}]},
        )
        assert out.startswith("# Clinic")
        assert "[Implants](/implants)" in out


class TestContentChecks:
    def test_separates_generated_from_human_prose(self):
        generated = (
            "In today's fast-paced digital landscape, it is important to note that "
            "businesses must leverage robust solutions. Furthermore, companies can "
            "unlock the power of seamless integration. Moreover, this plays a crucial "
            "role in the realm of growth. Additionally, organizations should delve "
            "into the tapestry of opportunity. In conclusion, it cannot be overstated."
        )
        human = (
            "We audited 412 dental clinics last quarter. Most ranked below the map "
            "pack for their own city name. The cause was nearly always the same: no "
            "location page, and a profile with two categories set. We fixed both on "
            "40 sites. Map pack impressions rose 61% in eight weeks."
        )
        assert ai_pattern_score(generated)["score"] < 60
        assert ai_pattern_score(human)["score"] > 90

    def test_flags_dash_punctuation(self):
        assert ai_pattern_score("A sentence — with a dash. " * 12)["dashes"] > 0

    def test_readability_returns_inputs(self):
        r = readability("Short words help. People read them fast. Keep it simple.")
        assert r["score"] is not None
        assert r["sentences"] == 3


class TestSchema:
    def test_flags_missing_required_properties(self):
        result = validate_jsonld([{"@type": "Product", "description": "x"}])
        assert not result["valid"]
        assert any("name" in i["message"] for i in result["errors"])

    def test_accepts_complete_markup(self):
        assert validate_jsonld([{"@type": "Article", "headline": "A title"}])["valid"]

    def test_flags_markup_that_contradicts_the_page(self):
        result = validate_jsonld(
            [{"@type": "Article", "headline": "A headline that is nowhere on the page"}],
            page_text="Completely different content about other things entirely.",
        )
        assert any(i["code"] == "schema_contradicts_page" for i in result["issues"])

    def test_generator_drops_empty_properties(self):
        block = generate_jsonld("Article", {"headline": "X", "author": "", "image": None})
        assert "author" not in block and "image" not in block
        assert block["@context"] == "https://schema.org"


class TestScoring:
    def test_a_critical_finding_caps_the_score(self):
        clean = health_score([], page_count=50).score
        with_critical = health_score(
            [FindingDraft("page_5xx", url="https://x.test/a")], page_count=50
        ).score
        assert clean == 100.0
        assert with_critical < 80, "a 5xx must not leave health looking healthy"

    def test_striking_distance_beats_already_winning(self):
        striking = opportunity_score(impressions=4000, clicks=40, position=12, ctr=0.01)
        winning = opportunity_score(impressions=4000, clicks=1000, position=1, ctr=0.25)
        assert striking > winning

    def test_ctr_curve_decreases_with_position(self):
        assert expected_ctr(1) > expected_ctr(3) > expected_ctr(10) > expected_ctr(30)

    def test_priority_rewards_impact_over_effort(self):
        cheap = FindingDraft("title_missing", url="https://x.test/a")
        dear = FindingDraft("thin_content", url="https://x.test/b")
        assert cheap.priority_score() > dear.priority_score()

    def test_fingerprints_are_stable_and_distinct(self):
        a = FindingDraft("title_missing", url="https://x.test/a")
        b = FindingDraft("title_missing", url="https://x.test/a")
        c = FindingDraft("title_missing", url="https://x.test/b")
        assert a.fingerprint() == b.fingerprint()
        assert a.fingerprint() != c.fingerprint()


class TestCatalogue:
    def test_every_check_is_complete(self):
        for code, definition in CATALOG.items():
            assert definition.recommendation, f"{code} has no recommendation"
            assert definition.why, f"{code} does not explain why it matters"
            assert definition.severity in ("critical", "high", "medium", "low", "info")
            assert 0 <= definition.impact <= 1
            assert 0 < definition.effort <= 1

    def test_auto_fixable_checks_name_a_strategy(self):
        for code, definition in CATALOG.items():
            if definition.auto_fixable:
                assert definition.fix_strategy, f"{code} is auto-fixable but has no strategy"


class TestUrlSafety:
    @pytest.mark.parametrize(
        "url",
        [
            "http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.1/", "http://192.168.1.1/", "http://[::1]/",
            "ftp://example.com/", "file:///etc/passwd", "http://metadata.google.internal/",
            "http://foo.local/", "http://svc.internal/",
        ],
    )
    def test_refuses_private_and_non_http(self, url):
        with pytest.raises(ValidationFailed):
            validate_url(url)

    @pytest.mark.parametrize("url", ["https://example.com/", "http://example.com/a?b=c"])
    def test_allows_public_http(self, url):
        assert validate_url(url).startswith("http")

    def test_strips_fragments(self):
        assert "#" not in validate_url("https://example.com/a#section")


class TestLinkGraph:
    def test_pagerank_favours_linked_pages(self):
        graph = LinkGraph()
        graph.nodes = {"/a", "/b", "/c"}
        graph.out_edges = {"/a": {"/b"}, "/c": {"/b"}, "/b": set()}
        graph.in_edges = {"/b": {"/a", "/c"}}
        ranks = graph.pagerank()
        assert ranks["/b"] > ranks["/a"]
        assert abs(sum(ranks.values()) - 1.0) < 0.01


class TestSchemaContradictionIsNarrow:
    """Regression: this check once fired on every page of every site.

    The rule compared `description` on any type, so a site-wide Organization
    block, whose description is an entity fact and was never body copy, marked
    forty of forty crawled pages with a high-severity finding. A wrong
    high-severity finding teaches the reader to discount the severe ones, so
    the narrowing is load-bearing rather than cosmetic.
    """

    ORG = {
        "@type": "Organization",
        "name": "Example Co",
        "description": "A long organisation description that is deliberately absent from the body copy.",
    }

    def test_organization_description_absent_from_page_is_not_a_contradiction(self):
        result = validate_jsonld([self.ORG], page_text="Totally unrelated page copy about pricing.")
        codes = [i["code"] for i in result["issues"]]
        assert "schema_contradicts_page" not in codes

    def test_article_headline_absent_from_page_is_a_contradiction(self):
        block = {"@type": "Article", "headline": "How to migrate a Postgres database safely"}
        result = validate_jsonld([block], page_text="This page is about kitchen furniture.")
        assert "schema_contradicts_page" in [i["code"] for i in result["issues"]]

    def test_article_headline_present_on_page_is_fine(self):
        headline = "How to migrate a Postgres database safely"
        result = validate_jsonld(
            [{"@type": "Article", "headline": headline}],
            page_text=f"{headline}. Here is the guide.",
        )
        assert "schema_contradicts_page" not in [i["code"] for i in result["issues"]]

    def test_faq_markup_without_questions_is_a_contradiction(self):
        block = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": "Q", "acceptedAnswer": {"text": "A"}}]}
        result = validate_jsonld([block], page_text="A page with no question marks at all.")
        assert "schema_contradicts_page" in [i["code"] for i in result["issues"]]


class TestScoresSayWhenTheyAreNotMeasured:
    """Regression: the CLI printed `authority 100.0` with no link data.

    Authority without a backlink source is a guess about the one input that
    defines it. The browser engine has refused to render that as a number
    since `score.ts` was written; this is the server engine agreeing.
    """

    def test_authority_without_link_data_is_unmeasured(self):
        breakdown = authority_score([], page_count=5)
        assert breakdown.measured is False
        assert breakdown.unmeasured_reason
        assert breakdown.unmeasured_fix

    def test_authority_with_link_data_is_measured(self):
        breakdown = authority_score([], referring_domains=120, competitor_median_domains=200, page_count=5)
        assert breakdown.measured is True
        assert breakdown.unmeasured_reason is None

    def test_the_flag_survives_serialisation(self):
        payload = authority_score([], page_count=5).to_dict()
        assert payload["measured"] is False
        assert payload["unmeasured_reason"]

    def test_health_is_always_measured_because_the_crawl_measures_it(self):
        assert health_score([], page_count=3).measured is True
