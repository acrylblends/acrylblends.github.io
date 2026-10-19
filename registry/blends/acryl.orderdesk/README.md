# Order Desk

A starter for a small business that sells from stock: customer emails in, orders out. The app opens on the pipeline (Inbox, Needs approval, Ready
to ship, Backorder, Shipped), with the agent beside it.

- **Emails** arrive in the Inbox: drop `.eml` or `.txt` files into the app's `inbox/` folder (a mail rule or a script can do that), paste one in the
  window, or forward the text to the agent.
- **The agent reads them** in any language ("Process the inbox"): it maps what the customer wrote to your products and makes the order, or answers
  the question, or asks you.
- **Stock** is reserved for each order, or the order waits as a backorder; when stock arrives ("we received 40 kg espresso"), waiting orders are
  reserved, oldest first, and their customers told.
- **Approval** is a rule: orders above a limit (1,000 EUR net by default) wait for a person.
- **Shipping** writes a printable delivery note (`delivery-notes/DN-1001.html`) and emails the customer.
- **Everything sent** (confirmations, shipping notices, replies, purchase orders to suppliers) is in the Outbox and as `.eml` files in `outbox/`.

```bash
acryl new my-desk --from acryl.orderdesk
my-desk/bin/acryl web
```

Click "Load the sample business" to try it with a coffee roaster's catalog and four customer emails (one in German, one a question, two that
the stock cannot cover), then ask the agent: "Process the inbox."

Your data stays in your app (`.acryl/orderdesk.json`). Then ask the builder inside for what your business needs: invoices for shipped orders,
a price list per customer, sending the outbox through your mail server. The project is yours: private and proprietary until you decide
otherwise. This starter's code is MIT licensed; its notice travels with your project in `THIRD-PARTY.md`.
