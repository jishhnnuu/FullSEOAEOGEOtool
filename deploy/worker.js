/**
 * The Worker entry point.
 *
 * OpenNext compiles the Next app to `apps/web/.open-next/worker.js`, which
 * exports a fetch handler and whatever Durable Objects the adapter needed.
 * Cloudflare needs a `scheduled` export as well before a cron trigger will
 * fire, and the generated file has none, so this wraps it: fetch and the
 * Durable Objects pass straight through, and `scheduled` is added.
 *
 * The scheduled handler calls the app's own route in this same isolate rather
 * than over the network, so there is no second request to pay for and no
 * public endpoint to protect with a shared secret.
 *
 * The token that authorises that call is minted inside the handler and cleared
 * when the run finishes, so it exists only while a firing is in flight. It is
 * minted there rather than at module load for a reason worth writing down: the
 * Workers runtime forbids generating random values in global scope, and a
 * worker that does it refuses to start at all. `wrangler deploy --dry-run`
 * does not catch that, because it bundles without ever starting the runtime.
 * `wrangler dev` does.
 */

import next from "../apps/web/.open-next/worker.js";

export * from "../apps/web/.open-next/worker.js";

export default {
  // Called rather than passed by reference, so the generated handler keeps its
  // own `this` whatever shape a future adapter version gives it.
  fetch(request, env, ctx) {
    return next.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const token = crypto.randomUUID();
    globalThis.__seoosCronToken = token;

    const request = new Request("https://scheduler.invalid/api/cron/tick", {
      method: "POST",
      headers: { "x-seoos-cron": token },
    });

    // waitUntil, so a slow tenant does not hold the cron open, and a failure
    // is logged rather than retried into a loop.
    ctx.waitUntil(
      next
        .fetch(request, env, ctx)
        .then((response) => response.text())
        .then((body) => console.log("cron", controller.cron, body.slice(0, 500)))
        .catch((error) => console.error("cron failed", error))
        .finally(() => {
          if (globalThis.__seoosCronToken === token) globalThis.__seoosCronToken = null;
        }),
    );
  },
};
