// #81 (0.1.8): the Customer page's "Send statement" button -- one dialog, a month at
// a time, email and WhatsApp together. The statement itself is statement.py.

frappe.ui.form.on("Customer", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Send statement"), () => nezmaro_statement_dialog(frm));
	},
});

function nezmaro_statement_months() {
	// This month and the twelve before it; last month is the default, because a
	// statement is sent once a month has closed.
	const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());
	const months = [];
	for (let back = 0; back < 13; back++) {
		const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
		const value = first.getFullYear() + "-" + String(first.getMonth() + 1).padStart(2, "0");
		months.push({ value: value, label: moment(first).format("MMMM YYYY") });
	}
	return months;
}

function nezmaro_statement_dialog(frm) {
	const months = nezmaro_statement_months();
	const dialog = new frappe.ui.Dialog({
		title: __("Send statement"),
		fields: [
			{
				fieldname: "month",
				fieldtype: "Select",
				label: __("Statement month"),
				options: months,
				default: months[1].value,
				reqd: 1,
				description: __("Opening balance, the month's transactions and the closing balance."),
			},
			{ fieldname: "by_email", fieldtype: "Check", label: __("By email"), default: frm.doc.email_id ? 1 : 0 },
			{
				fieldname: "email",
				fieldtype: "Data",
				options: "Email",
				label: __("Email address"),
				default: frm.doc.email_id || "",
				depends_on: "by_email",
				mandatory_depends_on: "by_email",
			},
			{ fieldname: "by_whatsapp", fieldtype: "Check", label: __("On WhatsApp"), default: frm.doc.mobile_no ? 1 : 0 },
			{
				fieldname: "mobile",
				fieldtype: "Data",
				label: __("WhatsApp number"),
				default: frm.doc.mobile_no || "",
				depends_on: "by_whatsapp",
				mandatory_depends_on: "by_whatsapp",
			},
		],
		primary_action_label: __("Send now"),
		primary_action(values) {
			if (!values.by_email && !values.by_whatsapp) {
				frappe.msgprint(__("Choose email, WhatsApp or both."));
				return;
			}
			frappe
				.call({
					method: "nezmaro_assistant.statement.send_statement",
					args: {
						customer: frm.doc.name,
						month: values.month,
						email: values.by_email ? values.email : "",
						mobile: values.by_whatsapp ? values.mobile : "",
					},
					freeze: true,
					freeze_message: __("Preparing the statement..."),
				})
				.then((r) => {
					const answer = r.message || {};
					const results = answer.results || [];
					const all_ok = results.length > 0 && results.every((row) => row.ok);
					const lines = results.map((row) => (row.ok ? "✓ " : "✗ ") + frappe.utils.escape_html(row.message));
					frappe.msgprint({
						title: all_ok ? __("Statement sent") : __("Statement not sent"),
						indicator: all_ok ? "green" : "orange",
						message:
							lines.join("<br>") +
							"<br><br>" +
							__("Closing balance for {0}: {1}", [
								frappe.utils.escape_html(answer.period || ""),
								frappe.utils.escape_html(answer.closing || ""),
							]),
					});
					if (all_ok) dialog.hide();
				});
		},
		secondary_action_label: __("Preview the PDF"),
		secondary_action() {
			const month = dialog.get_value("month");
			window.open(
				"/api/method/nezmaro_assistant.statement.download_statement?customer=" +
					encodeURIComponent(frm.doc.name) +
					"&month=" +
					encodeURIComponent(month)
			);
		},
	});
	dialog.show();
}
