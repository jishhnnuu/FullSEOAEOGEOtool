"""The HTTP surface, tenancy isolation, and the services behind them."""

from __future__ import annotations

import pytest
from seoos.analysis.findings import FindingDraft
from seoos.core.crypto import generate_master_key, rewrap, seal, unseal_json
from seoos.core.errors import Conflict
from seoos.services.content import ContentService, slugify
from seoos.services.findings import FindingsService


class TestCrypto:
    def test_seals_and_unseals(self):
        payload = {"refresh_token": "abc", "scope": "read"}
        assert unseal_json(seal(payload)) == payload

    def test_ciphertext_differs_each_time(self):
        payload = {"k": "v"}
        assert seal(payload) != seal(payload), "envelopes must not be deterministic"

    def test_rotation_preserves_the_plaintext(self):
        envelope = seal({"k": "v"})
        rotated = rewrap(envelope, generate_master_key())
        assert rotated != envelope
        assert unseal_json(envelope) == {"k": "v"}

    def test_rejects_a_corrupt_envelope(self):
        from seoos.core.crypto import DecryptionFailed

        with pytest.raises(DecryptionFailed):
            unseal_json("not an envelope")


class TestPasswords:
    def test_hashes_verify(self):
        from seoos.api.security import hash_password, verify_password

        hashed = hash_password("a-sufficiently-long-password")
        assert verify_password("a-sufficiently-long-password", hashed)
        assert not verify_password("wrong", hashed)

    def test_long_passwords_are_not_truncated(self):
        from seoos.api.security import hash_password, verify_password

        # bcrypt silently truncates past 72 bytes; pre-hashing avoids it.
        a, b = "x" * 200 + "A", "x" * 200 + "B"
        hashed = hash_password(a)
        assert verify_password(a, hashed)
        assert not verify_password(b, hashed)


class TestFindingsReconciliation:
    async def test_creates_then_updates_rather_than_duplicating(self, session, org, site):
        service = FindingsService(session)
        drafts = [
            FindingDraft("title_missing", url="https://example.com/a"),
            FindingDraft("h1_missing", url="https://example.com/b"),
        ]
        first = await service.reconcile(org_id=org.id, site_id=site.id, drafts=drafts)
        assert first.created == 2

        second = await service.reconcile(org_id=org.id, site_id=site.id, drafts=drafts)
        assert second.created == 0
        assert second.updated == 2
        assert len(await service.open_findings(site.id)) == 2

    async def test_closes_what_is_no_longer_seen(self, session, org, site):
        service = FindingsService(session)
        await service.reconcile(
            org_id=org.id, site_id=site.id,
            drafts=[FindingDraft("title_missing", url="https://example.com/a")],
        )
        result = await service.reconcile(org_id=org.id, site_id=site.id, drafts=[])
        assert result.resolved == 1
        assert await service.open_findings(site.id) == []

    async def test_reopens_a_regression(self, session, org, site):
        service = FindingsService(session)
        draft = FindingDraft("title_missing", url="https://example.com/a")
        await service.reconcile(org_id=org.id, site_id=site.id, drafts=[draft])
        await service.reconcile(org_id=org.id, site_id=site.id, drafts=[])
        again = await service.reconcile(org_id=org.id, site_id=site.id, drafts=[draft])
        assert again.regressed == 1
        rows = await service.open_findings(site.id)
        assert rows[0].status == "regressed"
        assert rows[0].regression_count == 1

    async def test_scoped_reconciliation_leaves_other_categories_alone(self, session, org, site):
        service = FindingsService(session)
        await service.reconcile(
            org_id=org.id, site_id=site.id,
            drafts=[
                FindingDraft("title_missing", url="https://example.com/a"),   # content
                FindingDraft("page_5xx", url="https://example.com/b"),        # technical
            ],
        )
        # A content-only run must not close technical findings it never looked for.
        await service.reconcile(
            org_id=org.id, site_id=site.id, drafts=[], categories=["content"]
        )
        remaining = await service.open_findings(site.id)
        assert {r.code for r in remaining} == {"page_5xx"}


class TestContentLifecycle:
    async def test_refuses_an_illegal_transition(self, session, org, site):
        service = ContentService(session)
        item = await service.create(org_id=org.id, site_id=site.id, title="Test")
        with pytest.raises(Conflict):
            await service.transition(item.id, "published")

    async def test_blocks_review_while_a_gate_is_failing(self, session, org, site):
        service = ContentService(session)
        item = await service.create(org_id=org.id, site_id=site.id, title="Test")
        await service.transition(item.id, "briefed")
        await service.transition(item.id, "drafting")
        item.body_markdown = "too short"
        await service.transition(item.id, "editing")
        await service.transition(item.id, "qa")
        with pytest.raises(Conflict) as exc:
            await service.transition(item.id, "review")
        assert "failing gates" in exc.value.message

    async def test_allows_review_once_gates_pass(self, session, org, site):
        service = ContentService(session)
        item = await service.create(org_id=org.id, site_id=site.id, title="Test")
        item.body_markdown = "word " * 400
        item.meta_title = "A reasonable title for the page"
        item.meta_description = "A description long enough to be useful to a searcher reading it."
        item.brand_score = 88
        item.quality_score = 84
        item.ai_pattern_score = 92
        for target in ("briefed", "drafting", "editing", "qa", "review"):
            await service.transition(item.id, target)
        assert item.status == "review"

    async def test_versions_are_snapshotted(self, session, org, site):
        from seoos.core.models import ContentVersion
        from sqlalchemy import func, select

        service = ContentService(session)
        item = await service.create(org_id=org.id, site_id=site.id, title="Test")
        await service.transition(item.id, "briefed")
        await service.transition(item.id, "drafting")
        count = (
            await session.execute(
                select(func.count()).select_from(ContentVersion)
                .where(ContentVersion.content_id == item.id)
            )
        ).scalar()
        assert count == 2

    def test_slugify(self):
        assert slugify("How to Rank in the Map Pack (2026)") == "how-to-rank-in-the-map-pack-2026"
        assert len(slugify("word " * 60)) <= 70


class TestApi:
    async def test_health_and_readiness(self, client):
        assert (await client.get("/health")).status_code == 200
        ready = await client.get("/ready")
        assert ready.json()["checks"]["database"] == "ok"

    async def test_everything_needs_authentication(self, client):
        for path in (
            "/api/v1/sites", "/api/v1/approvals", "/api/v1/agents",
            "/api/v1/notifications", "/api/v1/integrations/catalogue",
        ):
            assert (await client.get(path)).status_code == 401, f"{path} is unauthenticated"

    async def test_signup_login_and_me(self, client):
        signup = await client.post("/api/v1/auth/signup", json={
            "email": "a@example.co", "password": "a-sufficiently-long-password",
            "org_name": "Acme",
        })
        assert signup.status_code == 201
        login = await client.post("/api/v1/auth/login", json={
            "email": "a@example.co", "password": "a-sufficiently-long-password",
        })
        assert login.status_code == 200
        token = login.json()["access_token"]
        me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["org"]["name"] == "Acme"

    async def test_wrong_password_is_rejected(self, client):
        await client.post("/api/v1/auth/signup", json={
            "email": "b@example.co", "password": "a-sufficiently-long-password",
            "org_name": "Acme",
        })
        res = await client.post("/api/v1/auth/login", json={
            "email": "b@example.co", "password": "not-the-password",
        })
        assert res.status_code == 401

    @pytest.mark.parametrize(
        "url",
        ["http://localhost/", "http://169.254.169.254/", "file:///etc/passwd",
         "ftp://example.com/", "javascript:alert(1)"],
    )
    async def test_refuses_dangerous_site_urls(self, authed_client, url):
        res = await authed_client.post("/api/v1/sites", json={"name": "x", "base_url": url})
        assert res.status_code == 422, f"{url} was accepted"

    async def test_site_lifecycle(self, authed_client):
        created = await authed_client.post("/api/v1/sites", json={
            "name": "Example", "base_url": "example.com", "business_type": "saas",
        })
        assert created.status_code == 201
        site = created.json()
        assert site["domain"] == "example.com"
        assert site["status"] == "onboarding"

        activated = await authed_client.post(f"/api/v1/sites/{site['id']}/activate")
        assert activated.json()["status"] == "active"

        schedules = await authed_client.get(f"/api/v1/sites/{site['id']}/schedules")
        assert len(schedules.json()) > 0, "activation should bootstrap a cadence"

        dashboard = await authed_client.get(f"/api/v1/sites/{site['id']}/dashboard")
        assert dashboard.status_code == 200
        assert "missing_capabilities" in dashboard.json()

    async def test_tenants_cannot_see_each_other(self, client):
        first = await client.post("/api/v1/auth/signup", json={
            "email": "one@example.co", "password": "a-sufficiently-long-password",
            "org_name": "One",
        })
        second = await client.post("/api/v1/auth/signup", json={
            "email": "two@example.co", "password": "a-sufficiently-long-password",
            "org_name": "Two",
        })
        headers_one = {"Authorization": f"Bearer {first.json()['access_token']}"}
        headers_two = {"Authorization": f"Bearer {second.json()['access_token']}"}

        site = await client.post(
            "/api/v1/sites",
            json={"name": "Private", "base_url": "private.example"},
            headers=headers_one,
        )
        site_id = site.json()["id"]

        assert (await client.get(f"/api/v1/sites/{site_id}", headers=headers_two)).status_code == 404
        assert (await client.get("/api/v1/sites", headers=headers_two)).json() == []
        assert (
            await client.patch(f"/api/v1/sites/{site_id}",
                               json={"name": "hijacked"}, headers=headers_two)
        ).status_code == 404

    async def test_rejects_an_invalid_cron(self, authed_client):
        site = (await authed_client.post("/api/v1/sites", json={
            "name": "x", "base_url": "cron.example"})).json()
        res = await authed_client.put(f"/api/v1/sites/{site['id']}/schedules", json={
            "mission_key": "weekly_growth_cycle", "cron": "not a cron",
        })
        assert res.status_code == 400

    async def test_rejects_an_unknown_mission(self, authed_client):
        site = (await authed_client.post("/api/v1/sites", json={
            "name": "x", "base_url": "mission.example"})).json()
        res = await authed_client.post(f"/api/v1/sites/{site['id']}/run", json={
            "mission_key": "does_not_exist",
        })
        assert res.status_code == 404

    async def test_agents_endpoint_describes_the_roster(self, authed_client):
        data = (await authed_client.get("/api/v1/agents")).json()
        assert data["total"] >= 40
        assert "content" in data["by_department"]

    async def test_capabilities_reports_degraded_mode_honestly(self, client):
        data = (await client.get("/api/v1/capabilities")).json()
        assert data["agents"] > 0 and data["tools"] > 0
        assert "degraded" in data
