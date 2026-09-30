# nezmaro_assistant

A tiny Frappe app for Nezmaro tenant sites: an **Ask** button in the desk
navbar that opens a panel where the user asks how to do something ("how do
I add a customer", "where is the statement of account"), asks about their
own numbers, or asks the assistant to explain the error message they just
got.

It holds no model and no key. The panel calls one whitelisted method,
`nezmaro_assistant.api.ask`, which forwards the question to the Nezmaro
control plane using the site's own credentials from `site_config.json`
(`nezmaro_assistant_url`, `nezmaro_tenant_id`, `nezmaro_assistant_token`,
written by the control plane at provisioning). The control plane answers
from the Nezmaro manual and, for data questions, reads the site through its
read-only tool. Nothing here writes to the ERP.

## Ask Nezmaro acts with the asker's own permissions (0.2.5)

The control plane answers every question, and makes every confirmed write, with
this site's service keys, which can see and do everything. Before 0.2.5 nothing
told it who was asking, so a cashier could ask for employee pay and anyone who
could call `api.act` could have a Customer, Item or draft invoice written.

`ask` and `act` now refuse anyone who is not a System User (shoppers, portal
users) and send, for the doctypes Ask can use (`ASK_DOCTYPES`), which ones the
user may read IN FULL (`can_read`) and create (`can_create`). "In full" is
Frappe's own list query: role read, and no row condition at all — a User
Permission (an Employee user limited to their own record), an if-owner rule,
share-only access or a permission-query hook each make it a no, because the
service keys would otherwise show every row. The control plane offers only the
read tools and proposals inside those, and refuses an `act` outside them. A
desk older than 0.2.5 sends nothing and gets manual answers only.

## The Apps home screen (0.2.0)

A nine-dot button beside Ask Nezmaro in the navbar opens a home screen of big
app icons, like Odoo's: a greeting, the date, a "find an app" box and one
white rounded tile per workspace, the edition's own desk (Overview, Counter,
Clinic, Shop, Service) first in Nezmaro blue. It opens by itself when the desk
starts at the bare `/app`, which is where login lands; clicking an app, Esc,
the button again or moving to another page closes it.

`launcher.bundle.js` draws nothing the sidebar would not: it reads the same list
(`frappe.boot.sidebar_pages`, else `get_workspace_sidebar_items`), top-level
workspaces only, hidden ones left out even for a Workspace Manager, and builds
each link with the sidebar's own route rule. Icons are chosen by workspace NAME
(titles are retitled and translated); a workspace with no drawing gets its first
letter on a colour taken from its name. Labels are `__(title)`, so an Arabic desk
shows the sidebar's own Arabic words; the launcher's own few words live in the
script, not in `translations/ar.csv`, so they cannot override the engine's.

### Icons, the app you are in, and the sidebar (0.2.1)

The launcher's icons are 26 SVG files in `public/icons/apps/`, served from
`/assets/nezmaro_assistant/icons/apps/<name>.svg?v=<ICON_VERSION>` (the host caches
`/assets` for a year, so bump `ICON_VERSION` whenever a drawing changes). They were
generated on 2026-09-26 as one set with Recraft V4.1 in vector mode through Higgsfield
(one prompt style, a fixed five-colour palette), and five were redrawn until they read
at a glance. The generator's output was already vector, so no Adobe vectorising step
was needed. Each file was cleaned before it was committed: the full-canvas white square
(it would show as a white box on a dark tile) and the embedded C2PA content-credentials
block (most of each file's size) were removed. This paragraph is where the files' AI
origin is recorded now.

The same icons appear in two more places. Beside the logo on every page, the app
you are in: its icon and name, taken from the route on a desk and from Frappe's own
breadcrumb record elsewhere (a Sales Order list says Selling, Stock Balance says
Stock); a page that belongs to no workspace shows none. The launcher follows
`frappe.breadcrumbs.update`, because a report sets its breadcrumb after the page has
changed. And in the sidebar, where each workspace's grey line icon is replaced,
children included (Payables, Receivables, Financial Reports under Accounting). The
sidebar is repainted by a MutationObserver on a short timer, not requestAnimationFrame,
which never runs in a background tab (measured on the live desk).

Since 0.2.4 Frappe's breadcrumb no longer repeats the app: its first crumb, when it links
to the same workspace as the header (compared by link, so an Arabic desk matches too), is
hidden from 768px, where the header shows the app's name. Below 768px the header is icon-only
and the crumb is left alone (Frappe keeps only the last crumb below about 992px in any case).

## Sending a statement is POST only (0.1.9)

`statement.send_statement` is whitelisted for POST only. A bare
`@frappe.whitelist()` also answers GET, and Frappe checks the CSRF token only on
POST, PUT, DELETE and PATCH, so a crafted link opened by a logged-in user could
have sent a customer's statement to any WhatsApp number (found by the live
verification of 0.1.8, 2026-09-13; latent, no tenant had WhatsApp sending on).
The Send statement dialog already POSTs through `frappe.call`, and
`download_statement` keeps GET because the Preview opens the PDF in a new tab.

## The storefront in the shop's language (0.1.8)

Webshop draws the product list, the variant dialog and the cart in JavaScript,
so no Translation record reaches them and an Arabic shop still said OFF, Search
for Products and Select Variant. `storefront.py` (an `update_website_context`
hook, shops only, any language but English) adds one script to the page head
that, once the page has loaded, merges a message dictionary UNDER whatever the
page already holds -- a tenant's own wording always wins. Webshop ships no
Arabic, so `translations/ar.csv` carries it, together with this app's own order
page and checkout messages; a tenant's Translation records still take priority.
It only ADDS Arabic where the engine has none: an app installed after frappe and
erpnext overrides their translation of the same word everywhere, desk included,
so the 26 storefront words the engine already translates ("Submit", "Total",
"Items", ...) are left to the engine's wording, or the tenant's own.

The order page also stops reading "EGP 2,065.00" under lines that read
"1,995.00 ج.م": it passes the currency's symbol and side into the page and seeds
Frappe's formatter with them, never overwriting a value the page already has.
On an Arabic page its governorate list shows the Arabic names the shop typed on
its Delivery page (a Translation record of the shop's own still wins), and the
value posted stays the English name the checkout validates.

`quote` now refuses a governorate the shop does not deliver to, with the same
words as `place_order`. It used to answer a made-up destination from
`default_fee`, a number no real delivery ever charged.

## The customer statement (0.1.8, #81)

A **Send statement** button on the Customer page opens one dialog: a month (last
month by default), by email, on WhatsApp, or both, and a Preview of the PDF. The
statement is the month's: the opening balance brought forward, the month's
transactions, the closing balance -- the owner's decisions of 2026-09-13.

`statement.py` does not rebuild a report. The rows are ERPNext's own General
Ledger report for the customer, consolidated by voucher, drawn in ERPNext's own
statement-of-accounts template with the company's default letter head. The one
deliberate difference: the engine's Process Statement Of Accounts skips a
customer with no entries in the period; a customer who still owes last month's
balance gets a statement here, opening and closing lines only.

The user's own permissions decide (Customer read and GL Entry read). Email goes
through the site's own outgoing account and says so when there is none. WhatsApp
needs the tenant's Meta token, which only the control plane holds: the finished
PDF is posted to `/assistant/site/statement` with the site's own token, and the
control plane sends it with the tenant's approved document template.

## Seats (0.1.7)

`seats.py` refuses, on the site itself, a save that would give the tenant more
active desk users than the plan allows. The cap is the `max_users` the control
plane already writes into `site_config.json` at provisioning and on every plan
change -- until this hook nothing in Frappe read it, so users created from the
desk were never counted. The rule is the control panel's: an invited accountant
(only "Accountant (read)", plus "Desk User") is not a seat, till staff are, and
Administrator and Guest never count. Only a save that ADDS a seat is refused, so
a site already over its cap after a downgrade keeps working -- it just cannot
grow. Installs, migrations, patches and the setup wizard are never blocked.

## The shop half (0.1.6)

The same app also carries the **cash-on-delivery checkout** an Egyptian online
shop needs and the engine has no notion of. The webshop app ties its cart to a
logged-in user, and with no payment gateway its button only asks for a
quotation, so a shopper cannot place an order at all.

- `checkout.py` — guest-callable methods. `place_order` prices every line from
  the site's own Item Price and Pricing Rules, adds the delivery fee for the
  shopper's governorate, creates the Customer, Address and Contact, and submits
  a Sales Order. Nothing the browser sends decides a price.
- `www/order.html` — the one-page checkout: name, mobile, governorate, address.
  Server-rendered, so it is complete before any script runs.
- `public/js/shop.bundle.js` — a **Buy now** button beside the engine's own, on
  product pages and on the cart.

Its settings come from the control plane in `site_config.json` under
`nezmaro_shop` (governorates and fees, company, price list, accounts). The
order is created **on the site**, never by calling the control plane: a shop
must keep selling when the control plane is unreachable.

Installed per site by the control plane (`bench --site <site> install-app
nezmaro_assistant`); the app itself is baked into the host image the same
way the edition apps are (see `deploy/editions/`).

License: MIT.
