import { redirect } from "next/navigation";

/*
 * Retired, and redirected rather than deleted.
 *
 * This page compared the product against an agency, an enterprise suite and
 * an AI writer, in one table. Two other pages had grown to cover the same
 * ground better: /vs runs the agency comparison one desk at a time, and
 * /compare runs the tool comparisons one named tool at a time.
 *
 * So three hubs were competing for two intents, and nothing linked here any
 * more, which made it an orphan as well as a cannibal. Both are findings this
 * product raises against other people's sites, and our own site passing its
 * own checks is a rule here rather than an aspiration.
 *
 * A redirect rather than a delete because the URL may exist in somebody's
 * notes, and because a 404 on a page we chose to remove is carelessness
 * rather than tidying.
 */

export default function VsAgencyRedirect() {
  redirect("/vs");
}
