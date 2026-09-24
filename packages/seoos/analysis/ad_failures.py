"""Every way launching an advert can fail, and what happens instead.

Paid media is the first thing this product does that spends the client's
money, and money makes every failure mode expensive rather than annoying. A
crawl that half-finishes wastes a minute. A campaign that half-builds can
start spending against an ad group with no negative keywords, in a country
nobody chose, at three in the morning.

So the failures are enumerated here rather than discovered in production, and
each one carries four things: how it is detected, what the software does
without being asked, what the person is told, and the route that still ships
when the first route is closed. A failure with no fallback is allowed, but it
has to say so.

Two rules hold across the whole catalogue and are the reason most of these
never reach a client.

**Everything is built paused.** No advertising platform offers a transaction.
A campaign, its ad groups, its keywords and its creatives are four separate
API calls, and the network can drop between any two of them. So the entire
tree is created in a paused state, verified as a whole against what was
approved, and only then activated in a single final operation. A build that
fails halfway leaves something paused and harmless, and the cleanup deletes
it. Nothing this product creates can spend a penny before the last step.

**Pre-flight beats rollback.** Almost everything below is detectable before
the first write: permissions by reading the token's own grants, billing by
reading the account, policy by checking the copy, tracking by firing a test
conversion. Checking afterwards means explaining a mess. Checking first means
a sentence on a screen before anybody agreed to anything.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: How much a failure costs if nobody notices.
SEVERITIES = ("money", "blocked", "degraded", "cosmetic")


@dataclass(frozen=True)
class Failure:
    """One way this can go wrong, and the complete response to it."""

    code: str
    #: Which stage it happens at: connect, plan, build, launch, run, report.
    stage: str
    severity: str
    #: What actually goes wrong, in a sentence.
    what: str
    #: How the software knows, without a person looking.
    detect: str
    #: What happens automatically. Never "log and continue".
    respond: str
    #: What the person reads. Written for them, not for us.
    tell: str
    #: The route that still ships. Empty when there genuinely is not one.
    fallback: str = ""
    #: Platforms this is specific to. Empty means all of them.
    platforms: tuple[str, ...] = field(default_factory=tuple)


FAILURES: list[Failure] = [
    # ------------------------------------------------------------- connect
    Failure(
        code="scope_missing",
        stage="connect",
        severity="blocked",
        what="The token is valid but one permission the work needs was not granted, usually because the "
             "advertiser unticked a box on the consent screen.",
        detect="The granted scopes come back with the token. They are compared against the scopes this "
               "objective needs before anything is planned, not when a write fails.",
        respond="The missing scope is named and a re-consent link is generated that asks for that one "
                "scope alone, using incremental authorisation so nothing already granted is re-approved.",
        tell="Lead forms need one more permission than you granted. One click adds it, and you will not "
             "have to pick an account again.",
        fallback="Everything not needing that scope proceeds. A missing lead-form permission does not stop "
                 "a search campaign.",
    ),
    Failure(
        code="token_revoked",
        stage="run",
        severity="blocked",
        what="The advertiser revoked access, changed their password, or left the company whose account "
             "they connected.",
        detect="Any call answers 401 or invalid_grant. The connection is marked broken on the first "
               "occurrence rather than retried into a rate limit.",
        respond="All scheduled work for that account stops immediately. Nothing is paused on the platform, "
                "because a live campaign that is still performing should not be killed by an expired token.",
        tell="Our access to your Google Ads account ended. Campaigns are still running and still spending. "
             "Reconnect to resume management, or pause them yourself in the meantime.",
        fallback="Reporting continues from the last stored snapshot, labelled with the date it stopped.",
    ),
    Failure(
        code="no_ad_account",
        stage="connect",
        severity="blocked",
        what="The login worked but the person has no ad account, or no permission on the one they meant.",
        detect="The account list comes back empty or without the required role.",
        respond="The connect step does not complete, so no half-connected state is stored.",
        tell="That login has no ad account we can manage. If a colleague owns the account, they need to "
             "add you as an admin first, or connect it themselves.",
        fallback="We create the ad account structure as a plan the account owner can approve in one step.",
    ),
    Failure(
        code="wrong_account_picked",
        stage="connect",
        severity="money",
        what="The advertiser has several ad accounts and connected the wrong one, so the work would be "
             "built, and the money spent, in somebody else's account.",
        detect="The chosen account's name, currency, time zone and recent spend are shown back before "
               "anything is built, and the currency is compared against the budget being proposed.",
        respond="A budget in a different currency to the account blocks the plan rather than converting "
                "silently.",
        tell="This account bills in US dollars and the budget you set is in pounds. Confirm which you meant "
             "before anything is created.",
    ),

    # ------------------------------------------------------ account state
    Failure(
        code="no_billing",
        stage="launch",
        severity="blocked",
        what="No payment method on the ad account, so campaigns are created and never deliver.",
        detect="The account's billing status is read at pre-flight. Google and Meta both expose it.",
        respond="The build completes and stays paused. Activation is refused.",
        tell="Everything is built and waiting. Your Google Ads account has no payment method, so nothing "
             "can run until you add one. Here is the direct link.",
        fallback="The campaign sits approved and paused, and launches the moment billing is added, with no "
                 "second approval needed.",
    ),
    Failure(
        code="account_suspended",
        stage="launch",
        severity="blocked",
        what="The ad account is suspended, for policy, for unpaid balance, or for circumventing systems.",
        detect="Account status at pre-flight, and again before every activation.",
        respond="Nothing is built. Building into a suspended account wastes the operations quota and hides "
                "the real problem behind a stack of failed writes.",
        tell="Your Meta ad account is suspended, so nothing can be built in it. This is between you and "
             "Meta; here is the appeal form and what they usually want.",
        fallback="Budget is offered to the platforms that are not suspended, with the shortfall named.",
    ),
    Failure(
        code="business_unverified",
        stage="launch",
        severity="blocked",
        what="Meta requires business verification before some ad types, audience sizes and special "
             "categories are available.",
        detect="The Business Manager verification status is read before a plan proposes anything needing it.",
        respond="The plan is built without the gated features, and the difference is shown.",
        tell="Until your Business Manager is verified, Meta caps what this account can do. The plan below "
             "works without verification. Verifying takes a day and unlocks the rest.",
        fallback="A smaller but working plan runs now, and the gated parts are queued.",
        platforms=("meta_ads",),
    ),
    Failure(
        code="special_category",
        stage="plan",
        severity="blocked",
        what="Credit, employment, housing, social issues and politics are restricted categories with "
             "reduced targeting and mandatory declaration. An undeclared campaign in one is removed and "
             "the account is penalised.",
        detect="The offer and the landing page are classified against the platforms' published category "
               "definitions before the plan is written.",
        respond="The category is declared on the campaign, and the targeting is built within the reduced "
                "options rather than being built and then rejected.",
        tell="This is a credit offer, which Meta and Google both restrict. Age, postcode and gender "
             "targeting are unavailable by law. The plan below already accounts for that.",
    ),

    # --------------------------------------------------------------- build
    Failure(
        code="partial_build",
        stage="build",
        severity="money",
        what="The network drops, or the API errors, between creating a campaign and creating the things "
             "that make it safe. A campaign with no negative keywords and a live budget is the worst "
             "single outcome this desk can produce.",
        detect="Every created object id is recorded as it is created, and the tree is compared against the "
               "approved plan before activation.",
        respond="Everything is created paused, always. On any failure the recorded ids are deleted in "
                "reverse order, and anything that will not delete is paused and reported. Activation is a "
                "separate final call that runs only against a verified complete tree.",
        tell="The build failed partway and everything it had created has been removed. Nothing spent. "
             "Here is the step that failed and why.",
        fallback="The build is resumable: the plan is stored, so a retry rebuilds rather than restarting "
                 "from the interview.",
    ),
    Failure(
        code="rate_limited",
        stage="build",
        severity="degraded",
        what="The platform's operations quota for the day or the hour is exhausted.",
        detect="429 responses, and the quota headers the platforms return before the limit is reached.",
        respond="Exponential backoff with jitter, then the build is queued and resumed when the window "
                "resets. Nothing already created is discarded.",
        tell="Meta is rate limiting this account. The build is paused and resumes in about forty minutes. "
             "Nothing is lost.",
        fallback="Work continues on the other platforms meanwhile.",
    ),
    Failure(
        code="api_outage",
        stage="build",
        severity="degraded",
        what="The platform's API is down, or returning errors for reasons unrelated to our request.",
        detect="Repeated 5xx responses across unrelated calls, distinguished from a bad request by the fact "
               "that a read-only health call also fails.",
        respond="The build is queued and retried on a schedule. Nothing is marked failed, because a failure "
                "reported to the client for somebody else's outage is a failure of ours.",
        tell="Google's API is not responding. This is on their side and it is queued. Nothing needs doing.",
    ),
    Failure(
        code="api_version_deprecated",
        stage="build",
        severity="blocked",
        what="The platform retired the API version this code targets. Meta deprecates quarterly, Google "
             "roughly three times a year, and both give notice that is easy to miss.",
        detect="Deprecation warnings appear in response headers long before the cutoff, and are surfaced as "
               "an internal finding rather than swallowed.",
        respond="The version is pinned per platform in one place, and a deprecation warning raises an "
                "internal alert with the sunset date.",
        tell="Nothing, if we have done our job. This one is ours to fix before anybody notices.",
    ),
    Failure(
        code="lead_form_refused",
        stage="build",
        severity="degraded",
        what="The lead form cannot be created: the permission is absent, the Page is not eligible, the "
             "question type is restricted in that country, or the privacy policy URL is rejected.",
        detect="The form is created first, before the campaign that will reference it, precisely so this "
               "fails early and cheaply.",
        respond="The failure is classified. A missing permission asks for re-consent, a restricted question "
                "is dropped and the form rebuilt without it, a rejected privacy URL is checked for being "
                "reachable and on the advertiser's own domain.",
        tell="Meta will not accept a phone number field for this account in the UK without a verified "
             "business. The form is built with email and name, which usually converts better anyway.",
        fallback="A landing page form on the advertiser's own site, which we can build and which produces "
                 "better-qualified leads and a first-party record they own. The campaign switches objective "
                 "from lead form to conversions and keeps running.",
        platforms=("meta_ads", "tiktok_ads", "linkedin_ads"),
    ),
    Failure(
        code="asset_upload_failed",
        stage="build",
        severity="degraded",
        what="An image or video is rejected on upload: wrong codec, too large, aspect ratio unsupported, "
             "or the platform's transcoder failed.",
        detect="Every asset is validated locally against the placement's published spec before it is sent, "
               "so the upload is not the first check.",
        respond="A rejected asset is re-rendered to the nearest compliant spec and retried once. A second "
                "failure drops that placement rather than the campaign.",
        tell="Your video is 4K and TikTok caps at 1080p, so it was re-encoded. It is unchanged otherwise.",
        fallback="The campaign runs on the placements whose assets did upload, and the missing ones are "
                 "listed rather than quietly skipped.",
    ),

    # ------------------------------------------------------------- policy
    Failure(
        code="policy_rejected",
        stage="launch",
        severity="blocked",
        what="The platform disapproves the ad. Repeated disapprovals get an account restricted, and a "
             "restricted Meta account is sometimes never recovered.",
        detect="Copy, imagery and landing page are checked against the published policies before "
               "submission, and the review status is polled after.",
        respond="A pre-submission check refuses to send anything that trips a known rule. A disapproval "
                "after the fact pauses that ad only, never the campaign, and the reason is mapped to the "
                "specific rule and the specific fix.",
        tell="Meta disapproved this ad for implying a personal attribute: 'struggling with debt?' addresses "
             "the reader's financial situation, which their policy prohibits. Here it is rewritten two ways.",
        fallback="The other ads in the ad group keep delivering, so the campaign does not stop.",
    ),
    Failure(
        code="landing_page_mismatch",
        stage="plan",
        severity="blocked",
        what="The ad promises something the landing page does not mention. Google calls this destination "
             "mismatch and it is a disapproval, not a warning.",
        detect="The landing page is crawled with the engine this product already has, and the offer in the "
               "ad is checked for appearing on the page.",
        respond="The ad is not written until the page supports it, or the page fix is proposed first.",
        tell="The ad offers a free trial and the page does not mention one. Either the page needs the offer "
             "added, which the content desk can do, or the ad needs a different one.",
        fallback="The search desk already writes page fixes, so this becomes a fix in the existing queue.",
    ),
    Failure(
        code="landing_page_down",
        stage="run",
        severity="money",
        what="The destination breaks while the campaign spends. Every click is wasted until somebody "
             "notices, and nobody notices on a Saturday.",
        detect="Every live destination is fetched on a schedule and checked for status, redirect chain and "
               "the presence of the conversion tag.",
        respond="A non-200, or a redirect away from the offer, pauses the campaigns pointing at it and "
                "raises an alert. This is the one pause that happens without waiting for approval, because "
                "the alternative is spending money on a broken page.",
        tell="Your pricing page has been returning a 500 for eleven minutes. The two campaigns pointing at "
             "it are paused. They resume automatically when it recovers.",
        fallback="Traffic is not moved to another page, because sending a click somewhere it did not ask "
                 "for is worse than not spending it.",
    ),

    # -------------------------------------------------------- measurement
    Failure(
        code="tracking_absent",
        stage="plan",
        severity="money",
        what="No conversion tracking, so the platform optimises toward clicks, the reporting is fiction, "
             "and nobody can tell a winning campaign from a losing one.",
        detect="A test conversion is fired end to end and read back from the platform before launch.",
        respond="Launch is blocked. This is the desk's hard gate and it is not overridable by an autonomy "
                "setting.",
        tell="We will not spend your money until we can measure what it bought. Your site has no "
             "conversion tracking. Here is what needs to be installed, and we can install it.",
        fallback="None, deliberately. Advertising without measurement is the thing this product exists to "
                 "replace, so there is no version of it we will run.",
    ),
    Failure(
        code="tracking_double_counts",
        stage="run",
        severity="degraded",
        what="The browser pixel and the server event both report the same conversion, so the numbers "
             "inflate and the bidding algorithm overpays.",
        detect="Server and browser conversion counts are compared for the same window. A ratio far from "
               "one, in either direction, is the signal.",
        respond="Event deduplication is configured with a shared event id at install time, and the ratio "
                "is monitored rather than assumed.",
        tell="Meta counted 240 purchases, your shop recorded 121. The pixel and the server event are "
             "double counting. Fixed, and the corrected history is below.",
    ),
    Failure(
        code="consent_blocks_tracking",
        stage="run",
        severity="degraded",
        what="In the EEA and the UK, a visitor who declines cookies must not be tracked, and Google "
             "requires Consent Mode v2 signals or it will not use the data at all.",
        detect="Consent signals are read alongside conversions. A sudden drop in tracked conversions "
               "against steady site revenue is the fingerprint.",
        respond="Consent Mode v2 is configured so denied traffic sends cookieless pings, which preserves "
                "modelled conversions rather than losing the traffic entirely.",
        tell="About a third of your EU visitors decline cookies. Their conversions are modelled rather "
             "than measured and are labelled that way everywhere in this product.",
    ),
    Failure(
        code="attribution_disagrees",
        stage="report",
        severity="degraded",
        what="Meta claims the sale, Google claims the same sale, and the sum is larger than the number of "
             "customers. Every dashboard in this category prints that sum.",
        detect="Platform-claimed conversions are summed and compared against the site's own measured "
               "count. The gap is the double count.",
        respond="Platform figures are never added together into a total. They are shown per platform and "
                "labelled platform-claimed, alongside the measured figure and the blended cost per "
                "acquisition, which is the only number that cannot be gamed.",
        tell="Your platforms claim 84 sales between them. Your shop recorded 51. Both are true: each "
             "platform counts a sale it touched. The number to run your business on is 51.",
    ),

    # ---------------------------------------------------------------- money
    Failure(
        code="overspend",
        stage="run",
        severity="money",
        what="Spend runs past the agreed ceiling. Platform daily budgets are a guide, not a cap: Google "
             "can spend twice a daily budget on a given day and reconcile over the month.",
        detect="Spend is read hourly and compared against the approved envelope, not against the platform's "
               "own budget field.",
        respond="Crossing the ceiling pauses every campaign in the account and alerts. This is an "
                "unconditional pause, like the broken landing page, because the alternative is an invoice "
                "nobody agreed to.",
        tell="Spend hit your £2,000 monthly ceiling on the 19th. Everything is paused. Raise the ceiling to "
             "resume, or leave it and restart on the 1st.",
    ),
    Failure(
        code="spend_no_conversions",
        stage="run",
        severity="money",
        what="Money goes out and nothing comes back. The failure is not that it happened, it is that it "
             "continued for three weeks because a dashboard nobody opened said so.",
        detect="Spend since launch is compared against conversions and against the target cost per "
               "acquisition, with a click floor so a quiet first day does not trigger it.",
        respond="Past three times the target cost per acquisition with zero conversions, the campaign is "
                "paused and the likely cause is diagnosed: tracking, landing page, offer, or targeting, in "
                "that order of probability.",
        tell="This ad group has spent £310 and produced nothing. Your target is £95. It is paused. The "
             "landing page converts 0.2 per cent against a 2.1 per cent site average, so the page is the "
             "suspect rather than the ads.",
    ),
    Failure(
        code="budget_underspend",
        stage="run",
        severity="degraded",
        what="The opposite problem, and the more common one. The budget does not spend, so the month ends "
             "with the money unspent and the results proportionally missing.",
        detect="Pacing against a planned curve, checked daily rather than noticed at month end.",
        respond="The cause is diagnosed before the budget moves: too narrow an audience, too low a bid, a "
                "restrictive schedule, or not enough approved creative.",
        tell="You are pacing to spend 61 per cent of the month's budget. The bid cap is the constraint, not "
             "the audience. Raising it to £2.40 should clear it, and that is your decision.",
    ),
    Failure(
        code="learning_reset",
        stage="run",
        severity="degraded",
        what="Editing a live campaign restarts the platform's learning phase, which costs days of "
             "performance. Enthusiastic optimisation is how agencies destroy accounts.",
        detect="Every proposed change is classified against the platform's published list of what resets "
               "learning.",
        respond="Resetting changes are batched into one weekly window rather than applied as they occur, "
                "and a change inside an active learning phase is refused with the date it can be made.",
        tell="This budget rise would restart Meta's learning phase, which typically costs four days. The "
             "campaign exits learning on Thursday. It is queued for then unless you want it now.",
    ),

    # ---------------------------------------------------------- ecommerce
    Failure(
        code="feed_disapproved",
        stage="run",
        severity="money",
        what="Products are disapproved in Merchant Center, so shopping ads silently stop serving for them. "
             "A feed can lose half its products without the campaign reporting anything wrong.",
        detect="Product-level status is read daily and compared against the previous day's count.",
        respond="Disapprovals are grouped by reason, and the fixable ones are fixed: missing GTIN, price "
                "mismatch against the page, missing shipping, image too small.",
        tell="212 of your 1,940 products stopped serving yesterday. 190 are the same cause, a price on the "
             "page that no longer matches the feed. Fixed and resubmitted.",
        fallback="Products that cannot be fixed automatically are listed with the exact field to change.",
        platforms=("google_ads", "meta_ads", "microsoft_ads", "pinterest_ads"),
    ),
    Failure(
        code="feed_price_mismatch",
        stage="run",
        severity="blocked",
        what="A sale on the shop and a stale price in the feed is the most common shopping disapproval, "
             "and it happens every time the store runs a promotion.",
        detect="Feed price is compared against the live page price on a schedule.",
        respond="The feed is resubmitted from the shop's own source rather than patched, so the two cannot "
                "drift again.",
        tell="Your sale started at midnight and the feed still had yesterday's prices. Resubmitted at "
             "00:40, so about forty minutes of shopping traffic was affected.",
    ),

    # ------------------------------------------------------------- human
    Failure(
        code="approval_stale",
        stage="launch",
        severity="money",
        what="A plan approved three weeks ago is launched against an account that has changed: different "
             "budget, different products, a competitor's price cut.",
        detect="Every approval carries the state it was approved against. That state is re-read at "
               "activation and compared.",
        respond="A material difference invalidates the approval and asks again, showing what changed.",
        tell="You approved this on the 2nd. Since then your target cost per acquisition moved from £80 to "
             "£55, which this plan does not meet. Re-approve or let us rebuild it.",
    ),
    Failure(
        code="silent_success",
        stage="run",
        severity="degraded",
        what="Everything works and nobody is told anything useful, so the client cannot tell whether "
             "anything is happening. The commonest agency failure, and invisible from inside.",
        detect="Not a technical failure. It is designed against: the report leads with the decision, not "
               "the activity.",
        respond="A weekly report states the one number that matters, what changed it, and what is being "
                "done next. No screenshot of a dashboard, and no list of tasks completed.",
        tell="Cost per lead went from £74 to £61. Two of the four search campaigns did that; the other two "
             "are flat and one is being rebuilt. Nothing needs your attention this week.",
    ),
]

BY_CODE = {f.code: f for f in FAILURES}


def failure(code: str) -> Failure | None:
    return BY_CODE.get(code)


def at_stage(stage: str) -> list[Failure]:
    return [f for f in FAILURES if f.stage == stage]


def money_risks() -> list[Failure]:
    """The ones that cost the client rather than inconveniencing them."""
    return [f for f in FAILURES if f.severity == "money"]


def unconditional_pauses() -> list[str]:
    """The failures that pause spending without waiting for a person.

    Deliberately short. Pausing somebody's advertising without asking is a
    serious act, and it is justified in exactly three cases: the money is
    going somewhere broken, the money is going nowhere, or the money has
    passed the line they drew.
    """
    return ["landing_page_down", "spend_no_conversions", "overspend"]


def without_fallback() -> list[Failure]:
    """Failures where there is genuinely no other route, stated rather than hidden."""
    return [f for f in FAILURES if not f.fallback]
