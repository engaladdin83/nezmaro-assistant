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
