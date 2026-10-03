// 0.2.6: the User form's Language list shows every language, not only the
// shop's one enabled row, so a desk user can pick their own. See languages.py.

frappe.ui.form.on("User", {
	setup(frm) {
		frm.set_query("language", () => ({
			query: "nezmaro_assistant.languages.search_languages",
		}));
	},
});
