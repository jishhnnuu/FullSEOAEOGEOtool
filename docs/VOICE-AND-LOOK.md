# Voice and look

How the site sounds and how it looks. Every public page follows this. If a
page breaks a rule here, the page is wrong, not the rule.

---

## The voice in one line

**The friend who is scarily good at marketing.** Quick, warm, a bit cheeky,
and never wrong about the numbers.

Who we are, in one line: **a marketing agency run by people, powered by AI.**
The reader is a founder with no marketing team, who may not have a website
yet and will not hand their business to software they have never heard of.
Lead with the person; the AI is the reason it is affordable, not the thing
being sold.

Two halves, and both have to be there:

| Energy | Credibility |
| --- | --- |
| Short. Punchy. Moves fast. | Every number is real, or it says it is not. |
| A joke now and then. | Never a joke about your money or your results. |
| Talks like a person. | Knows exactly what it is doing, and shows it. |
| Excited about your site. | Never excited about itself. |

---

## Seven rules

1. **One line, then a button.** If an idea needs a second paragraph, the
   second paragraph goes in an accordion or on another page.
2. **Headlines under eight words.** Section intros under twenty-five.
3. **Every section ends in something to do.** A section with no action is
   decoration.
4. **The action goes first.** "Book a free call" is in the hero, with the free
   site check beside it, not at the bottom.
5. **One joke per screen, maximum.** Funny earns the attention. Precise earns
   the sale.
6. **Say "you", not "the client".** Say "we", not "the platform". Say "your
   person" or "your marketing lead" for the human, and "the AI team" for the
   agents. Never "desk" on a public page: a founder buys a service.
7. **Detail is opt-in.** The honest caveats stay, because honesty is the
   product, but they sit in an accordion or a small tag, not in the way.

Still banned, from the main writing rules: em dashes, en dashes, "unlock",
"elevate", "seamless", "robust", "leverage", "delve".

### Before and after

| Before | After |
| --- | --- |
| "They crawl the site, find what is wrong, write the change, push it through your CMS and check it went live." | "We find it. We fix it. You click yes." |
| "Nothing above the fold asks for input." | The URL box is the first thing you see. |
| "Forty of fifty-five pages is a score of those forty, and you are told so before you read the number." | Tag on the score: "Based on 40 of 55 pages". |
| "A page implying a service exists is the one thing this business cannot survive." | "We will always tell you what is ready and what is not." |

---

## The look

**Fresh, bright, a little bold.** Warm paper, black ink, one zesty green, and
a colour per desk. Chunky buttons that look pressable. Rounded, friendly
shapes. Big confident type.

### Colour

| Role | Token | Light | Why |
| --- | --- | --- | --- |
| Page | `--bg` | cream `#FFF9EF` | Warmer and friendlier than white |
| Ink | `--text` | `#16130F` | Near-black, softer than pure black |
| Brand | `--accent` | thyme `#0E6B4A` | Growth, and a nod to the name |
| Action | `--zest` | lime `#D4F55A` | The one colour that means "press this" |
| Heads-up | `--pop` | coral `#FF6B4A` | Used rarely, so it still gets noticed |

Each desk has its own colour, so you always know where you are:

| Desk | Colour |
| --- | --- |
| Search | lime `#D4F55A` |
| Content | lilac `#CDBDFF` |
| Social | pink `#FFB8D4` |
| Paid | sunshine `#FFCA70` |
| Your CMO | mint `#A9EBCF` |

Dark mode keeps the same desk colours and flips the paper to ink.

### Type

- **Headings:** Bricolage Grotesque, heavy weight, tight spacing. Characterful
  without being silly.
- **Body:** the system sans, 16px. Fast, readable, native on every device.

Both fonts are self-hosted at build time, so no visitor's browser talks to
Google to render the page. The privacy page promises that.

### Components

- **Primary button:** lime, black border, a hard shadow offset down and right.
  It moves when you press it.
- **Desk tiles:** the desk's colour, black border, the same hard shadow.
- **Accordions:** a plus that turns into a minus. Anything long lives here.
- **Tags:** small rounded pills for status ("Ships today", "Plans today").
- **Highlighter:** a lime marker stroke behind the one word in a headline that
  matters.

---

## Three directions considered

The chosen one is first.

1. **Fresh (chosen).** Cream, ink, thyme, lime, a colour per desk. Playful and
   trustworthy at once, and nobody else in marketing software looks like it.
2. **Electric night.** Dark by default, violet and neon. Very young, very
   techy. Rejected for now because a business owner about to trust us with an
   ad budget reads it as a toy.
3. **Sunday paper.** Cream, black and one hot red, editorial and witty. Strong,
   but it reads as a publication rather than a product people use every day.

Any of these could swap in through the tokens at the top of `globals.css`
without touching a page.
