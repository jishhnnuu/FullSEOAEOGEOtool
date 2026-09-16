/**
 * What can be connected, what each connection unlocks, and what happens
 * without it.
 *
 * Every capability in the platform degrades with a stated reason rather than
 * failing. Onboarding does not open with twelve OAuth screens: the audit runs
 * on the public site alone, and each gap on this list turns into "connect X
 * and we can also do Y".
 */

export type FieldSpec = {
  key: string;
  label: string;
  kind: "text" | "password" | "url" | "select" | "textarea";
  required: boolean;
  help: string;
  placeholder?: string;
  options?: string[];
};

export type ConnectorSpec = {
  provider: string;
  name: string;
  category: "measurement" | "cms" | "local" | "links" | "outreach" | "data" | "model";
  summary: string;
  unlocks: string[];
  withoutIt: string;
  authKind: "oauth" | "api_key" | "service_account" | "credentials";
  docsUrl: string;
  setupNotes: string;
  fields: FieldSpec[];
  essential: boolean;
};

export const CONNECTORS: ConnectorSpec[] = [
  {
    provider: "gsc",
    name: "Google Search Console",
    category: "measurement",
    summary: "The only first-party record of what people searched before they reached you.",
    unlocks: [
      "Real query data instead of a keyword model derived from your own copy",
      "Indexing status per URL, and why a page is not indexed",
      "Click and impression movement attributed to each change",
      "A sample of referring domains, free",
    ],
    withoutIt: "Keywords are inferred from the site's own content, and results cannot be attributed to the work.",
    authKind: "oauth",
    docsUrl: "https://search.google.com/search-console",
    setupNotes:
      "Create a service account in Google Cloud, enable the Search Console API, then add the service account email as a user on the property. Paste the JSON key below. It is held in this browser only.",
    fields: [
      { key: "property", label: "Property URL", kind: "url", required: true, help: "Exactly as it appears in Search Console, including the protocol.", placeholder: "https://example.com/" },
      { key: "service_account_json", label: "Service account JSON", kind: "textarea", required: true, help: "The whole key file. Stored in this browser, sent only to Google." },
    ],
    essential: true,
  },
  {
    provider: "ga4",
    name: "Google Analytics 4",
    category: "measurement",
    summary: "Sessions, conversions and revenue, so a ranking change can be tied to money.",
    unlocks: [
      "Conversions and revenue per landing page",
      "Before and after reads on every change that shipped",
      "Traffic segmented by the channel that actually brought it",
    ],
    withoutIt: "Reporting shows crawl and ranking movement but cannot say what it earned.",
    authKind: "service_account",
    docsUrl: "https://analytics.google.com",
    setupNotes: "Same service account as Search Console works. Add it as a Viewer on the GA4 property, then paste the numeric property ID.",
    fields: [
      { key: "property_id", label: "Property ID", kind: "text", required: true, help: "The numeric ID from Admin, Property Settings.", placeholder: "123456789" },
      { key: "service_account_json", label: "Service account JSON", kind: "textarea", required: true, help: "The whole key file." },
    ],
    essential: true,
  },
  {
    provider: "gbp",
    name: "Google Business Profile",
    category: "local",
    summary: "The profile that decides whether you appear in the map pack.",
    unlocks: [
      "Weekly posts written and queued for approval",
      "Review replies drafted within hours, gated by rating",
      "Hours, categories, services and attributes kept complete",
      "Geo grid rank measurement across a radius, not one city-level number",
    ],
    withoutIt: "Local findings are limited to what the website itself shows.",
    authKind: "oauth",
    docsUrl: "https://developers.google.com/my-business",
    setupNotes:
      "One access request to Google, once, for the whole account. It takes a few days and it is free. After that nothing needs approving again: posting, replying to reviews and editing the profile all run on the business.manage scope you granted at connection, and Google does not review individual posts. Until the request clears, posts and replies are drafted here for you to paste in.",
    fields: [
      { key: "location_id", label: "Location ID", kind: "text", required: true, help: "From the Business Profile API, or the profile URL." },
      { key: "oauth_token", label: "OAuth refresh token", kind: "password", required: true, help: "Held in this browser only." },
    ],
    essential: false,
  },
  {
    provider: "wordpress",
    name: "WordPress",
    category: "cms",
    summary: "Publish approved content and apply on-page fixes directly.",
    unlocks: [
      "Approved drafts published as posts or pages",
      "Title, meta and schema written back to the page",
      "Internal links inserted into existing copy",
      "Alt text written to the media library",
    ],
    withoutIt: "Every approved change is handed to you as the exact text to paste, with where it goes.",
    authKind: "credentials",
    docsUrl: "https://developer.wordpress.org/rest-api/",
    setupNotes:
      "Create an Application Password under Users, Profile. Not your login password. The REST API must be reachable at /wp-json/wp/v2.",
    fields: [
      { key: "site_url", label: "WordPress URL", kind: "url", required: true, help: "The address of the WordPress install.", placeholder: "https://example.com" },
      { key: "username", label: "Username", kind: "text", required: true, help: "The account the Application Password belongs to." },
      { key: "app_password", label: "Application password", kind: "password", required: true, help: "Generated under Users, Profile, Application Passwords." },
    ],
    essential: false,
  },
  {
    provider: "shopify",
    name: "Shopify",
    category: "cms",
    summary: "Product, collection and blog optimisation written back to the store.",
    unlocks: [
      "Product titles, descriptions and metafields updated",
      "Collection pages given real copy instead of a product grid",
      "Product schema completed with the merchant listing fields",
      "Blog articles published",
    ],
    withoutIt: "Changes are produced as text and CSV for you to import.",
    authKind: "api_key",
    docsUrl: "https://shopify.dev/docs/api/admin-rest",
    setupNotes: "Create a custom app in the Shopify admin with read and write access to products, content and themes.",
    fields: [
      { key: "shop", label: "Store domain", kind: "text", required: true, help: "The myshopify.com domain.", placeholder: "your-store.myshopify.com" },
      { key: "access_token", label: "Admin API access token", kind: "password", required: true, help: "Starts with shpat_." },
    ],
    essential: false,
  },
  {
    provider: "webflow",
    name: "Webflow",
    category: "cms",
    summary: "CMS collection items and page settings updated in place.",
    unlocks: ["Collection items created and updated", "SEO fields written per page", "Publishing to the live site on approval"],
    withoutIt: "Changes are produced as text to paste into the Designer.",
    authKind: "api_key",
    docsUrl: "https://developers.webflow.com",
    setupNotes: "Create a site API token in Site Settings, Apps and Integrations.",
    fields: [
      { key: "site_id", label: "Site ID", kind: "text", required: true, help: "From Site Settings, General." },
      { key: "api_token", label: "API token", kind: "password", required: true, help: "Site level token." },
    ],
    essential: false,
  },
  {
    provider: "generic_cms",
    name: "Any other CMS or static site",
    category: "cms",
    summary: "Git, a webhook, or a person. All three are supported.",
    unlocks: [
      "Changes exported as a pull request, a patch file or plain text",
      "A webhook fired with the approved payload",
    ],
    withoutIt: "Nothing. This is the fallback that means no site is unsupported.",
    authKind: "credentials",
    docsUrl: "",
    setupNotes: "Point this at a webhook and the approved change is POSTed as JSON. Leave it empty and approved work is exported instead.",
    fields: [
      { key: "webhook_url", label: "Webhook URL", kind: "url", required: false, help: "Optional. Receives the approved change as JSON." },
      { key: "secret", label: "Shared secret", kind: "password", required: false, help: "Sent as a signature header so your endpoint can verify it." },
    ],
    essential: false,
  },
  {
    provider: "dataforseo",
    name: "DataForSEO",
    category: "data",
    summary: "SERP positions, keyword volumes and a backlink index, pay as you go.",
    unlocks: [
      "Real search volumes and difficulty instead of a derived model",
      "Daily rank tracking for the terms that matter",
      "The referring domain set for you and every competitor",
      "Competitor content gaps from live SERPs",
    ],
    withoutIt: "Keyword work runs on Search Console data and the site's own topic model. Link work is limited to prospects the crawl can see.",
    authKind: "api_key",
    docsUrl: "https://dataforseo.com/apis",
    setupNotes: "Roughly $0.002 per SERP. A small site's monthly cycle costs cents, which is why this is the default data source rather than an enterprise suite.",
    fields: [
      { key: "login", label: "API login", kind: "text", required: true, help: "The email on the DataForSEO account." },
      { key: "password", label: "API password", kind: "password", required: true, help: "From the API dashboard." },
    ],
    essential: false,
  },
  {
    provider: "ahrefs",
    name: "Ahrefs",
    category: "links",
    summary: "Referring domains, anchors, and what competitors earned recently.",
    unlocks: ["Full referring domain profile", "Lost and gained links", "Competitor link gaps"],
    withoutIt: "Link prospecting works from the site's own outbound links and missing entity records.",
    authKind: "api_key",
    docsUrl: "https://ahrefs.com/api",
    setupNotes: "Requires an Ahrefs API plan.",
    fields: [{ key: "api_token", label: "API token", kind: "password", required: true, help: "From the Ahrefs API dashboard." }],
    essential: false,
  },
  {
    provider: "smtp",
    name: "Your email, for outreach",
    category: "outreach",
    summary: "Outreach is sent from your domain, through your provider. Never ours.",
    unlocks: [
      "Personalised outreach sent under a per-domain daily cap",
      "Replies tracked against each prospect",
      "Follow-ups that stop the moment someone answers",
    ],
    withoutIt: "Outreach emails are drafted and handed to you to send.",
    authKind: "credentials",
    docsUrl: "",
    setupNotes:
      "Sending from your own domain is the only version of this that works. A shared platform domain gets burned by somebody else's campaign and takes yours with it.",
    fields: [
      { key: "host", label: "SMTP host", kind: "text", required: true, help: "For example smtp.gmail.com" },
      { key: "port", label: "Port", kind: "text", required: true, help: "587 for STARTTLS, 465 for TLS.", placeholder: "587" },
      { key: "username", label: "Username", kind: "text", required: true, help: "Usually the full email address." },
      { key: "password", label: "Password or app password", kind: "password", required: true, help: "An app password where the provider offers one." },
      { key: "from_name", label: "From name", kind: "text", required: true, help: "A person's name outperforms a company name by a wide margin." },
    ],
    essential: false,
  },
  {
    provider: "bing",
    name: "Bing Webmaster Tools",
    category: "measurement",
    summary: "Bing feeds Copilot and DuckDuckGo, and almost nobody checks it.",
    unlocks: ["Bing query and indexing data", "IndexNow submission so changes are picked up in minutes"],
    withoutIt: "Bing and Copilot visibility is unmeasured.",
    authKind: "api_key",
    docsUrl: "https://www.bing.com/webmasters",
    setupNotes: "Get an API key from Bing Webmaster Tools, Settings, API access.",
    fields: [{ key: "api_key", label: "API key", kind: "password", required: true, help: "From Bing Webmaster Tools." }],
    essential: false,
  },
];

export function connectorFor(provider: string): ConnectorSpec | undefined {
  return CONNECTORS.find((c) => c.provider === provider);
}

export const CATEGORY_ORDER: ConnectorSpec["category"][] = ["measurement", "cms", "local", "data", "links", "outreach", "model"];

export const CATEGORY_LABEL: Record<ConnectorSpec["category"], string> = {
  measurement: "Measurement",
  cms: "Where the site lives",
  local: "Local and maps",
  data: "Search data",
  links: "Link intelligence",
  outreach: "Outreach",
  model: "Model provider",
};
