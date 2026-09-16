# Links: what this does, and exactly where it stops

Written after building it, so the limits are measured rather than guessed.

## The correction that changes everything

An earlier version of this document said competitor link gap analysis was
impossible without a subscription. That was wrong, and the error was pricing,
not engineering.

DataForSEO charges **$0.024 per request plus $0.000036 per row**. A thousand
backlinks costs **six cents**. Ahrefs charges roughly **five dollars** for the
same thousand rows through their API. A full gap analysis across five
competitors at ten thousand rows each lands near **two dollars**.

So the one piece of link research that genuinely needed a commercial index is
not a subscription decision. It is a rounding error, on the tenant's own key,
the same way the model relay works. We hold no account with any data provider.

## The short version

Link building has five jobs. This does all five.

| Job | State | Why |
| --- | --- | --- |
| **Verify** a claimed link | Better than most paid tools | `rel` is an HTML attribute. This reads the served HTML, so it survives |
| **Find** prospects from your own site | Works, three tactic classes free | Broken inbound, redirect chains and outbound mentions are all in the crawl |
| **See a competitor's links** | Works, about $2 a run | DataForSEO, tenant's own key, pay as you go |
| **Judge** a prospect | Works, two separate scores | Evidence-based, and it separates dangerous from worthless |
| **Know what to publish** | Works, derived not brainstormed | Built from the AI answers you lost |

## Verification, which is the part worth having

The most common failure in link building is reporting links that are not real,
not followed, or no longer live. An agency says four links landed, the report
says four, and nobody loads the page.

The mechanical reason tools get this wrong: **`rel` is an attribute, not text.**
Anything that fetches a page as markdown or plain text has thrown it away
before the check runs. A tool that then reports "no nofollow found" has told
you nothing, because the attribute was never in what it read.

This reads the served HTML and parses the anchors, so the attribute survives.
Verified against real pages:

```
confirmed  followed=true   placement=footer    wordpress.org/about -> wordpress.com
confirmed  followed=false  placement=content   wikipedia.org       -> google.com
           rel="mw:extlink nofollow"
not_found                                      example.com         -> nosuchdomain.test
```

The Wikipedia row is the one that matters. A text-extraction tool reports that
link as won. It passes nothing.

What each verdict carries: whether the link exists, the literal `rel`, whether
that means followed, the anchor text, where on the page it sits, and whether
the page carrying it is indexable. A link on a noindexed page passes nothing
however good it looks, and that is stated rather than buried.

**Its one limit.** A link rendered only by JavaScript is reported as
unconfirmed rather than missing. That is the correct answer: no AI crawler
executes JavaScript and Googlebot defers it, so a link that only exists after
render is a link that passes little or nothing anyway.

## Discovery: what free sources actually give you

### Google Search Console
The authoritative view, because it is Google's own record of what it found.
Free, no cap that matters, up to 100,000 rows on export.

**Three limits, and the third is the painful one:**
1. The UI shows 1,000 rows. Export gives 100,000.
2. **It does not say whether a link is nofollow.** So it tells you a link
   exists, not whether it counts. This is exactly what the verifier above
   fixes: export the list, paste it in, get the real `rel` for each one.
3. **There is no API for it.** The Search Console API covers Search Analytics,
   URL Inspection and Sitemaps. The Links report is not in it, and never has
   been. So this cannot be polled on a schedule. The file has to be exported
   and uploaded.

### Bing Webmaster Tools
A genuinely different set, because BingBot crawls differently from Googlebot.
`GetLinkCounts` and `GetUrlLinks` are in the API and the key is free.

**The limit:** only for sites you have verified. It can never see a
competitor's links, which rules out the one use everybody wants it for.

### Common Crawl
The open link graph. ~120 GB of compressed Parquet per quarterly release.

**Why this is not wired in:** it is a quarterly snapshot, so it cannot see a
link that landed last week, and it undersamples deep pages on large sites, so
the domain graph is trustworthy and the page graph is not. Processing it also
needs a machine, not an edge worker.

### Open PageRank
A free, bulk, domain-level score derived from Common Crawl. Good enough to sort
a prospect list into worth-pitching and not.

**The limit:** a quarterly snapshot with the same undersampling. Use it as a
tier, never as a number to put in front of a client. Domain Rating and Domain
Authority are proprietary and cannot be reproduced from open data. Anyone who
claims to is estimating.

### DataForSEO, which is how the gap analysis happens
Pay as you go, no monthly fee, 2.02 trillion live links. Six cents per thousand
backlinks. The tenant adds their own key and the following turn on:

- Referring domains, ranked by authority
- Broken inbound links, which are the cheapest links in existence
- Anchor distribution, where over-optimisation shows up
- **The competitor gap**: domains linking to rivals and not to you, with the
  ones linking to more than one rival first, because their editorial appetite
  is proven twice over

**Its limit:** DataForSEO reports live links only. Ahrefs and Semrush include
historical data, so the raw index numbers are not comparable. For mainstream
domains the coverage is close enough that the difference does not change a
decision.

## Finding prospects without paying

Three tactic classes are fully visible from the crawl, and they happen to be
the three cheapest links available.

**Broken inbound links.** A URL of yours that 404s while pages still link to
it. No outreach at all: one redirect and the equity comes back. This is the
cheapest link in existence and most programmes never look.

**Redirect chains.** Links landing on a redirect lose a little at each hop.
Point them at the final URL.

**Outbound mentions.** Every organisation you link to and who does not link
back. Clients, suppliers, partners, associations. These convert far better
than cold outreach because the relationship already exists.

The other nine tactics need a person or a search index. They are documented on
the Links screen with effort and realistic yield, so a plan can be built from
the cheap end rather than starting with guest posts, which is doing the hardest
thing first.

## Mentions, which now matter more than links

The single most important finding in the research, and the reason this side of
the product is organised around mentions rather than followed links.

Ahrefs analysed **75,000 brands** in 2026. Brand mentions correlate with AI
Overview visibility at **0.664**. Backlinks correlate at **0.218**. YouTube
mentions are the strongest single factor at roughly **0.737**. BuzzStream found
75% of digital PR people have been asked by a client about the link between PR
placements and AI citations, and **11% have a process**.

The mechanism is not mysterious. A language model has no link graph. It has
text. Being named repeatedly, in places a model was trained on or retrieves
from, is what makes it able to say who you are. A followed link helps a crawler
find you. A mention is what teaches a model you exist.

Two consequences the category has not caught up with:

1. **An unlinked mention is not a failure.** It is most of the value already
   delivered. Reclaiming the link adds the ranking part; the AI part landed the
   day the article published.
2. **Outreach should be measured on mentions earned.** A placement that refuses
   a link is still worth having.

What this does with that:

- Tracks every mention, linked and unlinked, with the sentence around it
- Marks which mentioning domains answer engines actually cite
- Plots mentions gained against the AI visibility curve we already measure, and
  reports a correlation **only once there are four readings**, because a
  correlation from three points is arithmetic rather than evidence
- Ranks reclamation by whether the engines cite that domain, not by authority

The prospect list for mentions is derived rather than bought: every domain an
answer engine named while answering a question about your category is a domain
that, if it named you, would put you in that answer.

## Risk, and why ours has two numbers

Every tool in the category ships a "toxicity score": one opaque figure out of a
hundred, from a proprietary model nobody can audit, which usually turns out to
be a rough function of domain authority.

Two things are wrong with that.

**The category error.** "Toxic" conflates two completely different problems. A
link from a dead directory is *worthless*: it does nothing, and removing it
changes nothing. A link from a network that sells placements is *dangerous*: it
can earn a manual action. Those need opposite responses and a single number
cannot express both. So this returns two, separately: **scheme risk** and
**waste risk**.

**Unauditable scores cannot be acted on.** Every point here traces to a named,
observable fact with the evidence attached and a sentence telling you how to
check it yourself in thirty seconds. The patterns come from Google's published
link spam policy, not from folklore.

Patterns only visible across the whole profile are assessed separately, because
per-link scoring misses them entirely. Ten links each carrying the anchor "best
accounting software" are individually unremarkable and collectively the
strongest signal of manufactured links there is.

### What Google actually says about disavow

John Mueller, March 2026: the disavow tool "is not a part of normal site
maintenance. I would really only use that if you have a manual spam action."
Googlers have said "toxic backlinks" is a phrase link-removal services
invented. SpamBrain filters low-quality links algorithmically. Bing removed its
disavow tool entirely in 2023.

So this engine is deliberately reluctant. It identifies scheme evidence
whenever it exists, and it **refuses to generate a disavow file unless a manual
action is reported**, because a careless disavow removes links Google was
counting in your favour. When one is warranted, only the links carrying
documented scheme evidence go in it, each with its reason as a comment.

This is tested: a profile of five obvious link-farm links produces no disavow
file without a manual action, and with one the file lists the farm and excludes
both the ordinary link and the merely worthless one.

## What to publish, derived rather than brainstormed

Most link building fails for a reason no amount of outreach fixes: the site has
nothing worth citing. You can send four hundred emails about a services page
and earn nothing.

The usual answer is a brainstorm. This derives it from the questions the answer
engines were asked and did not name you in. Every lost prompt is a question
your category is being asked where somebody else is the source. That is not a
content gap in the usual sense, it is a citation gap, and it names the asset
precisely. Who the engines cited instead tells you the format that earns the
citation.

Each idea comes with why it would earn links, the evidence that demand exists,
what we can produce, and what only a person can supply. That last column is
honest: original data needs data, and a free tool needs someone to build it.

## Judging a prospect

**Risk first, and it overrides everything.** A page advertising paid placement,
naming itself a link network, or selling links outright is rejected whatever
its metrics say. The cost of a manual action is larger than the value of any
single link. Volume never justifies it.

**Then tier.** Authority from Open PageRank where available, relevance from the
crawl, and an outbound-link count, because a page carrying a hundred outbound
links passes almost nothing through any one of them.

**Anchor text distribution** is where over-optimisation shows up and it is the
most common way a small site earns a manual action while believing it is doing
well. Exact-match anchors above roughly 15% is the shape Google's own link spam
documentation describes. Natural profiles are mostly brand names and bare URLs.

## Outreach

Every message is drafted. None is sent. Sending is a person's decision, every
time, and the rules are in the code rather than in a policy document, because a
policy in a document is a policy the software can break:

- Never send automatically
- At most two approaches to one domain per month
- No role addresses (`info@`, `admin@`, `sales@`), which reach nobody and mark
  the sender as a bulk mailer
- One follow-up, then stop
- Stop on reply
- Never offer payment or a reciprocal link

A draft cannot be generated without a specific detail from the target page.
That is not politeness, it is the only thing that separates a reply from a
delete, so the template will not fill without it.

**The limit:** reply tracking needs a mailbox connection. Until one exists, the
pipeline knows what was drafted and not what came back.

## What an agency does that this still does not

Being straight about it, because this is the gap that remains:

1. **Relationships.** A good link builder has people who take their call. That
   is worth more than any tool and cannot be built in software.
2. **Digital PR.** Original research, a survey, a data story. The one tactic
   with no ceiling, and it needs someone to have the idea.
3. **Journalist requests.** Answering a reporter well and within the hour. The
   highest-authority links available to a small company, and a human job.
4. **Judgement about a specific site.** Whether this particular link, on this
   particular page, is worth the effort.

What this removes is the rest: the verification nobody does, the reporting that
was wrong, the prospect research, the qualification, the drafting, and the
monitoring that catches a link falling off six weeks after it landed.
