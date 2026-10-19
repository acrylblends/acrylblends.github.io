# Accounting

A starter kit grown from Blank for a small business: invoices (create, list, mark paid), expenses, and a VAT and income summary for any period. The data is
plain local JSON in your project (`.acryl/accounting.json`); nothing leaves your machine. This is bookkeeping support, not tax advice.

```bash
acryl new my-books --from acryl.accounting
my-books/bin/acryl web
```

Operate it in plain language, in the chat: "add an invoice for ACME, 1200 EUR, due in 14 days", "which invoices are overdue?", "summarize Q3 VAT". The app
opens on the books, with the agent beside them: use the forms and "Mark paid" yourself, and watch the books change as the agent works. Then ask the builder inside to extend it: a CSV export, reminders,
a second currency. The project is yours: private and proprietary until you decide otherwise. This starter's code is MIT licensed.
