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
