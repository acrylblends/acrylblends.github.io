# Outlay

Expense books an agent keeps for you. Say what you spent and the agent writes it down; the
dashboard is the app's front door, with today/week/month/all-time totals, a seven-day chart, a
category donut, and monthly **budgets** whose bars fill green, turn amber near the limit and red
when you go over. A **CSV** button in the top bar downloads every entry.

Use the forms yourself, or press **Ask** and talk: "lunch 12 cash", "set a food budget of 300",
"how much did I spend on travel this month?", "delete the taxi from yesterday". The books change
as the agent works. Your data stays in your app (`data/outlay.jsonl`, `data/outlay.categories.json`,
`data/outlay.budgets.json`).

```bash
acryl new my-expenses --from smrifat1411.outlay
my-expenses/bin/acryl web
```

Then ask the builder inside for what your money needs: recurring rent, multi-currency, a yearly
view. The project is yours: private and proprietary until you decide otherwise. The source lives
at <https://github.com/smrifat1411/outlay>; this starter's code is MIT licensed.
