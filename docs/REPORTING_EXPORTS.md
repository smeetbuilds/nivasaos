# Reports and CSV exports

NivasaOS reporting uses the synchronized integer minor-unit mirrors created by the money migration. Aggregation does not sum the legacy SQLite `REAL` columns.

## Exact reporting contract

The report data layer reads:

- `units.monthly_rate_minor` for occupied monthly value;
- `invoices.amount_minor` and `invoices.amount_paid_minor` for arrears;
- `payments.amount_minor` for monthly collections.

Balances are calculated with integer subtraction. Multi-property totals remain separated by currency. Conversion to a major-unit number occurs only when localized currency text is rendered.

## CSV export

Use the **Export CSV** action on the Reports page or request:

```text
/api/reports/export
/api/reports/export?property=<permitted-property-id>
```

The route requires an authenticated account with `reports.view` in the requested scope. It returns `401` for an unauthenticated request and `403` for an inaccessible property.

Every financial CSV row includes:

- an exact decimal string with two digits;
- the underlying integer minor-unit value;
- currency;
- record type and report context.

The export is UTF-8 with a BOM for spreadsheet compatibility, disables caching, and escapes commas, quotes and line breaks. It never exports proof files, identity numbers, passwords, tokens or private configuration.

## Reconciliation

Use the integer column as the authoritative reconciliation value. The decimal column is a presentation-friendly representation of the same integer amount.

For example:

```text
amount_decimal,amount_minor
9.90,990
```

The current release assumes a scale of 100 minor units per major unit. Currency-specific scales remain a documented future migration boundary.
