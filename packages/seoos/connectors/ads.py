"""Ad platforms: how access actually works, and what each one will let us write.

The question this file settles, before any agent or screen makes a promise:
**the advertiser never handles a credential.** They press Connect, the
platform's own login page opens on the platform's own domain, they sign in
with the password they already use, and the platform asks whether they want
this software to manage their advertising. They say yes. We are handed a
token scoped to that permission, which they can revoke from their own account
settings at any moment without telling us. We never see the password, they
never paste anything, and nothing about their account is reachable beyond the
scopes on the consent screen they read.

The thing that sometimes gets confused with a user credential is a **developer
token**. It is not one. It identifies the software to the platform, the way a
number plate identifies a car, and it grants access to nobody's data on its
own: without a user's OAuth grant alongside it, a developer token opens
nothing. There is exactly one per platform, it belongs to us, and applying for
it is our job rather than the advertiser's.

So each row below has two halves that must not be mixed up:

  ``user_action``        what the advertiser does. Always one button.
  ``app_requirements``   what we must clear before that button works for the
                         public. Paperwork, on our side, once, ever.

The second half is the honest cost of this desk. Every platform gates
ad-writing behind a review of the software doing the writing, because the API
spends other people's money. None of it is technically hard and none of it is
optional, so it is written down here rather than discovered halfway through a
client engagement.

Sources are the platforms' own developer documentation as of September 2026.
Where a platform changes its terms, this file is the one place to change.
"""

from __future__ import annotations

from dataclasses import dataclass

# Objectives this product supports. Both are built together, because a
# business that starts as lead generation and adds a shop should not discover
# the desk only knows one of them.
OBJECTIVES = ("lead_gen", "ecommerce")


@dataclass(frozen=True)
class AdPlatform:
    """One advertising platform, and the truth about getting into it."""

    key: str
    name: str

    # ---------------------------------------------------------- the user
    #: What the advertiser does, in their own words. Always a single button.
    user_action: str
    #: The OAuth scopes the consent screen will list. They read these.
    oauth_scopes: tuple[str, ...]
    #: What each scope buys, so the connect screen can explain itself.
    scope_reasons: tuple[str, ...]

    # ------------------------------------------------------------ the app
    #: What we must obtain before the button works for anyone but us.
    app_requirements: tuple[str, ...]
    #: Honest calendar time for that, not the optimistic number.
    review_time: str
    #: Where we can build and test everything before approval lands.
    sandbox: str | None

    # --------------------------------------------------------- capability
    #: What the API will genuinely create and change.
    writes: tuple[str, ...]
    #: What it will not, so nothing downstream promises it.
    cannot: tuple[str, ...]
    #: Which objectives this platform is worth money for.
    objectives: tuple[str, ...]
    #: Native lead forms, created through the API.
    lead_forms: bool
    #: Product feed, for shopping and catalogue ads.
    product_feed: bool
    #: Can a closed-won sale be sent back to the platform later?
    offline_conversions: bool
    #: The server-side conversion endpoint, which is how measurement survives
    #: browser tracking loss. None means the platform has no such thing.
    server_events: str | None
    #: "live" once both halves above are done. Nothing claims otherwise.
    status: str
    #: Why this platform is worth the money, in one sentence a founder reads.
    worth_it: str


PLATFORMS: list[AdPlatform] = [
    AdPlatform(
        key="google_ads",
        name="Google Ads",
        user_action="Sign in with the Google account that already manages your ads, and approve one permission.",
        oauth_scopes=("https://www.googleapis.com/auth/adwords",),
        scope_reasons=(
            "Read your campaigns, spend and results, and create or change campaigns you approve.",
        ),
        app_requirements=(
            "A Google Ads manager account of our own, which is free to open.",
            "A developer token on that manager account. Basic access allows 15,000 operations a day, "
            "which is far past what this product needs.",
            "Google OAuth verification of the adwords scope, which is classified sensitive. That means "
            "Google reviews the app and the consent screen. It does not require the third-party security "
            "assessment that restricted scopes require.",
            "A published privacy policy and terms on our own domain, linked from the consent screen.",
        ),
        review_time="Developer token in days. OAuth verification typically two to six weeks.",
        sandbox="Test accounts under our manager account work immediately with a test-level developer token, "
                "so the whole build is exercised against the real API before approval.",
        writes=(
            "Campaigns, ad groups, keywords with match types, negative keyword lists",
            "Responsive search ads, Performance Max asset groups, Demand Gen, display and video",
            "Budgets, bid strategies and target CPA or ROAS",
            "Audiences, customer match lists, exclusions",
            "Conversion actions, and offline conversion uploads against a stored click id",
            "Assets: images, logos, videos, sitelinks, callouts, structured snippets",
        ),
        cannot=(
            "See another advertiser's keywords, spend or quality score. Nothing does, at any price.",
            "Set a quality score. It is an output, and any tool selling control of it is selling nothing.",
        ),
        objectives=("lead_gen", "ecommerce"),
        lead_forms=True,
        product_feed=True,
        offline_conversions=True,
        server_events="Enhanced Conversions, plus offline conversion import keyed on the stored click id",
        status="planned",
        worth_it="The only network where the customer has already told you what they want. Intent, not interruption.",
    ),
    AdPlatform(
        key="microsoft_ads",
        name="Microsoft Advertising",
        user_action="Sign in with the Microsoft account that manages your ads, and approve one permission.",
        oauth_scopes=("https://ads.microsoft.com/msads.manage", "offline_access"),
        scope_reasons=(
            "Read and manage the campaigns in your Microsoft Advertising accounts.",
            "Keep working on a schedule after you close the tab.",
        ),
        app_requirements=(
            "A Microsoft Advertising account of our own.",
            "A developer token, which is issued from the Microsoft Advertising interface without a review "
            "queue. This is the least gated of the major platforms by a wide margin.",
            "An app registration in Microsoft Entra for the OAuth client.",
        ),
        review_time="Days, and the sandbox token is immediate.",
        sandbox="A full sandbox environment with its own accounts and its own token.",
        writes=(
            "Campaigns, ad groups, keywords, negatives",
            "Responsive search ads, shopping campaigns, audience ads",
            "Budgets, bid strategies, target CPA and ROAS",
            "Conversion goals and offline conversion uploads",
            "Import of an entire Google Ads account, which the API performs natively",
        ),
        cannot=(
            "Reach the audience volume Google has. This is a supplement, never a replacement.",
        ),
        objectives=("lead_gen", "ecommerce"),
        lead_forms=True,
        product_feed=True,
        offline_conversions=True,
        server_events="Offline conversion import, and enhanced conversions for the UET tag",
        status="planned",
        worth_it="Cheaper clicks than Google for the same intent, an older and wealthier audience, "
                 "and it also serves Yahoo, DuckDuckGo and Copilot. Usually the best cost per lead in the account.",
    ),
    AdPlatform(
        key="meta_ads",
        name="Meta (Facebook and Instagram)",
        user_action="Log in with Facebook and choose which Business account and ad account we may work in.",
        oauth_scopes=(
            "ads_management",
            "ads_read",
            "business_management",
            "pages_show_list",
            "pages_manage_ads",
            "leads_retrieval",
            "instagram_basic",
            "catalog_management",
        ),
        scope_reasons=(
            "Create and change the campaigns you approve.",
            "Read the spend and results of what is running.",
            "See which Business and ad accounts you want us to work in.",
            "List the Pages the ads will run from.",
            "Create the lead form itself, rather than sending you to build one.",
            "Collect the leads a form captures and pass them to you and to your CRM.",
            "Run the same ad on Instagram from the linked account.",
            "Keep a product catalogue in step with your shop.",
        ),
        app_requirements=(
            "A Meta app with Advanced Access to ads_management, granted by App Review. The submission "
            "needs a screencast showing each permission being used for the stated purpose.",
            "Business Verification of our own company, using incorporation documents.",
            "A completed Data Protection Assessment, Meta's annual questionnaire on how data is handled.",
            "A privacy policy URL, a terms URL and a working data deletion callback endpoint. Meta calls the "
            "endpoint and expects a confirmation code it can check.",
        ),
        review_time="Two to six weeks, and a rejection usually means a clearer screencast rather than a redesign.",
        sandbox="Sandbox ad accounts run the whole Marketing API without spending money or needing Advanced Access.",
        writes=(
            "Campaigns, ad sets, ads, and Advantage+ campaigns",
            "Creatives from uploaded images and video, carousels, collections",
            "Instant lead forms on a Page, with custom questions and a privacy policy link",
            "Audiences: custom, lookalike, value-based, and exclusions",
            "Budgets at campaign or ad set level, schedules, and bid caps",
            "Product catalogues and dynamic product ads",
            "Conversions API events, server to server",
        ),
        cannot=(
            "Read a competitor's spend, reach or impressions. Only the ad creative is public, through the "
            "Ad Library, and even that is limited outside the EU.",
            "Guarantee a form field. Some question types are restricted by vertical and by country.",
        ),
        objectives=("lead_gen", "ecommerce"),
        lead_forms=True,
        product_feed=True,
        offline_conversions=True,
        server_events="Conversions API, with event deduplication against the browser pixel",
        status="planned",
        worth_it="The largest paid audience there is, and the one place a business with no existing demand "
                 "can manufacture some. Creative is the targeting.",
    ),
    AdPlatform(
        key="tiktok_ads",
        name="TikTok Ads",
        user_action="Log in with TikTok for Business and pick the advertiser account.",
        oauth_scopes=("ad_account_management", "campaign_management", "reporting", "lead_generation"),
        scope_reasons=(
            "See which advertiser accounts you want us to work in.",
            "Create and change the campaigns you approve.",
            "Read what the campaigns spent and returned.",
            "Create instant forms and collect the leads they capture.",
        ),
        app_requirements=(
            "A TikTok for Business developer app, approved for the Marketing API.",
            "A privacy policy and terms URL.",
        ),
        review_time="One to three weeks, and noticeably less painful than Meta.",
        sandbox="A sandbox advertiser account covering campaign creation and reporting.",
        writes=(
            "Campaigns, ad groups, ads",
            "Creatives from uploaded video, and Spark Ads from an existing organic post",
            "Instant forms",
            "Audiences and exclusions",
            "Budgets, schedules, bid strategies",
            "Product catalogues",
            "Events API, server to server",
        ),
        cannot=(
            "Make a bad video work. The creative carries more of the result here than on any other network.",
        ),
        objectives=("lead_gen", "ecommerce"),
        lead_forms=True,
        product_feed=True,
        offline_conversions=True,
        server_events="Events API",
        status="planned",
        worth_it="The cheapest attention left, and Spark Ads let an organic post that already worked be paid "
                 "behind, which the social desk can identify.",
    ),
    AdPlatform(
        key="linkedin_ads",
        name="LinkedIn Ads",
        user_action="Sign in with LinkedIn and choose the ad account.",
        oauth_scopes=("r_ads", "rw_ads", "r_ads_reporting", "r_organization_social"),
        scope_reasons=(
            "See the ad accounts you want us to work in.",
            "Create and change the campaigns you approve.",
            "Read what they spent and returned.",
            "Run ads from your company page.",
        ),
        app_requirements=(
            "Approval into the LinkedIn Marketing Developer Platform, which is an application reviewed by a "
            "person and is the strictest of the major networks.",
            "A verified company page for our own business.",
        ),
        review_time="Four to twelve weeks, and rejection is common on a first attempt.",
        sandbox="Limited. Most testing happens against a real account with a one pound daily budget.",
        writes=(
            "Campaign groups, campaigns, creatives",
            "Lead gen forms",
            "Matched audiences and exclusions",
            "Budgets and bid strategies",
            "Conversions API events",
        ),
        cannot=(
            "Be cheap. Cost per click is several times Google's, so it only pays where a customer is worth "
            "four figures or more.",
        ),
        objectives=("lead_gen",),
        lead_forms=True,
        product_feed=False,
        offline_conversions=True,
        server_events="Conversions API",
        status="planned",
        worth_it="The only network that targets job title and company size accurately. For business to "
                 "business with a high contract value, nothing else is close.",
    ),
    AdPlatform(
        key="pinterest_ads",
        name="Pinterest Ads",
        user_action="Log in with Pinterest and pick the ad account.",
        oauth_scopes=("ads:read", "ads:write", "catalogs:read", "catalogs:write"),
        scope_reasons=(
            "Read what is running and what it returned.",
            "Create and change the campaigns you approve.",
            "Read your product catalogue.",
            "Keep the catalogue in step with your shop.",
        ),
        app_requirements=(
            "A Pinterest developer app. Trial access is self-serve; standard access needs a short review.",
        ),
        review_time="Days to two weeks.",
        sandbox="Trial access acts as the sandbox and works against real accounts at low volume.",
        writes=(
            "Campaigns, ad groups, pins as ads",
            "Product catalogues and shopping campaigns",
            "Audiences",
            "Budgets and bid strategies",
            "Conversions API events",
        ),
        cannot=(
            "Deliver volume outside a handful of verticals. Home, food, fashion, weddings and craft work; "
            "most other categories do not.",
        ),
        objectives=("ecommerce",),
        lead_forms=False,
        product_feed=True,
        offline_conversions=False,
        server_events="Conversions API",
        status="planned",
        worth_it="Buying intent with a long tail, and the cheapest cost per acquisition in its verticals.",
    ),
    AdPlatform(
        key="reddit_ads",
        name="Reddit Ads",
        user_action="Log in with Reddit and pick the ad account.",
        oauth_scopes=("adsread", "adsedit"),
        scope_reasons=(
            "Read what is running and what it returned.",
            "Create and change the campaigns you approve.",
        ),
        app_requirements=(
            "A Reddit Ads API application, reviewed before write access is granted.",
        ),
        review_time="Two to four weeks.",
        sandbox="None published. Testing runs against a real account at minimum budget.",
        writes=(
            "Campaigns, ad groups, ads",
            "Audiences by subreddit, interest and custom lists",
            "Budgets and bid strategies",
            "Conversions API events",
        ),
        cannot=(
            "Survive a bad tone. Reddit punishes advertising that reads like advertising more than any "
            "other network, and the comments are public underneath the ad.",
        ),
        objectives=("lead_gen", "ecommerce"),
        lead_forms=False,
        product_feed=False,
        offline_conversions=False,
        server_events="Conversions API",
        status="planned",
        worth_it="Subreddit targeting reaches a considered buyer mid-research, at a price nobody else charges.",
    ),
    AdPlatform(
        key="snapchat_ads",
        name="Snapchat Ads",
        user_action="Log in with Snapchat and pick the ad account.",
        oauth_scopes=("snapchat-marketing-api",),
        scope_reasons=("Read and manage the campaigns in your Snapchat ad accounts.",),
        app_requirements=("A Snap developer app approved for the Marketing API.",),
        review_time="Two to four weeks.",
        sandbox="A sandbox ad account for the Marketing API.",
        writes=(
            "Campaigns, ad squads, ads",
            "Creatives from uploaded video",
            "Audiences",
            "Budgets and bid strategies",
            "Conversions API events",
        ),
        cannot=(
            "Reach anyone over about thirty-five in useful volume.",
        ),
        objectives=("ecommerce",),
        lead_forms=True,
        product_feed=True,
        offline_conversions=False,
        server_events="Conversions API",
        status="planned",
        worth_it="Young audience at low cost, for a product that suits it. For most businesses it does not.",
    ),
    AdPlatform(
        key="amazon_ads",
        name="Amazon Ads",
        user_action="Sign in with Amazon and pick the advertising account.",
        oauth_scopes=("advertising::campaign_management",),
        scope_reasons=("Read and manage sponsored product and brand campaigns.",),
        app_requirements=(
            "An Amazon Ads API application, approved per region.",
        ),
        review_time="Two to six weeks.",
        sandbox="A sandbox covering campaign management.",
        writes=(
            "Sponsored Products, Sponsored Brands, Sponsored Display",
            "Keywords, negatives, product targeting",
            "Budgets and bids",
        ),
        cannot=(
            "Help a business that does not sell on Amazon. There is no off-Amazon use for this.",
        ),
        objectives=("ecommerce",),
        lead_forms=False,
        product_feed=False,
        offline_conversions=False,
        server_events=None,
        status="planned",
        worth_it="For a seller, the last click before the purchase, on the platform holding the card details.",
    ),
]

BY_KEY = {p.key: p for p in PLATFORMS}


def platform(key: str) -> AdPlatform | None:
    return BY_KEY.get(key)


def for_objective(objective: str) -> list[AdPlatform]:
    """Platforms worth money for this kind of business, in recommended order."""
    return [p for p in PLATFORMS if objective in p.objectives]


def live() -> list[AdPlatform]:
    """Platforms both halves of the access model are finished for."""
    return [p for p in PLATFORMS if p.status == "live"]


def with_server_events() -> list[AdPlatform]:
    """Platforms whose measurement survives browser tracking loss."""
    return [p for p in PLATFORMS if p.server_events]


def access_summary() -> dict:
    """What a person needs to know about getting this desk switched on.

    Printed on the setup screen rather than kept in a runbook, because the
    honest answer to "when can I run ads through this" is a date, and a date
    depends on a queue at Google and a queue at Meta rather than on us.
    """
    return {
        "user_ever_handles_a_credential": False,
        "platforms": len(PLATFORMS),
        "live": len(live()),
        "awaiting_our_approval": len([p for p in PLATFORMS if p.status == "planned"]),
        "testable_before_approval": len([p for p in PLATFORMS if p.sandbox]),
        "note": (
            "Every platform here is reached by the advertiser pressing Connect and logging in on the "
            "platform's own site. No advertiser types a key into this product, on any platform, ever. "
            "What stands between us and a live campaign is our own application to each platform, which "
            "is listed per platform and is paperwork rather than engineering."
        ),
    }
