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

Installed per site by the control plane (`bench --site <site> install-app
nezmaro_assistant`); the app itself is baked into the host image the same
way the edition apps are (see `deploy/editions/`).

License: MIT.
