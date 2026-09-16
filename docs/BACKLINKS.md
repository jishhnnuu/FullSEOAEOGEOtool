# Links: what this does, and exactly where it stops

Written after building it, so the limits are measured rather than guessed.

## The short version

Link building has four jobs. This does three of them properly and cannot do
the fourth without paying somebody.

| Job | State | Why |
| --- | --- | --- |
| **Verify** a claimed link | Better than most paid tools | `rel` is an HTML attribute. This reads the served HTML, so it survives |
| **Find** prospects from your own site | Works, for three tactic classes | Broken inbound links, redirect chains and outbound mentions are all in the crawl |
| **Judge** a prospect | Works, with a caveat | Risk screening is pattern work. Authority needs Open PageRank, which is a tier not a number |
| **See a competitor's links** | **Cannot** | No free source exposes another domain's backlinks. This needs a commercial index |

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

### What no free source can do
**Competitor backlink gap analysis.** Finding the sites linking to three rivals
and not to you is the single highest-yield piece of link research, and it needs
an index of the whole web. Ahrefs, Semrush and Majestic each run one. There is
no free equivalent and no clever workaround. This is a real limitation and
engineering does not remove it.

If that analysis is the constraint, the honest answer is one month of Ahrefs
Lite at about £99, run the gap analysis, export the list, cancel. The prospect
list keeps working long after the subscription stops.

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
