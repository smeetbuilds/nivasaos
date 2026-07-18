# NivasaOS CSS architecture

The original interface was built through numbered release slices. That protected old screens during rapid feature delivery, but it also created an opaque cascade and made visual QA difficult.

The architecture is now transitional but explicit:

- `legacy/index.css` loads frozen compatibility slices from versions 0.1–0.9 in their original order.
- `part-12.css` remains temporarily because it contains the v0.10 vertical/responsive release contract.
- `part-13.css` remains temporarily because repository verification treats it as the semantic interaction/state contract.
- `foundation.css` contains enterprise tokens, shell, shared controls, surfaces, forms, tables, and responsive foundations.
- `branding.css` contains the bundled NivasaOS identity, white-label previews, and responsive brand surfaces.
- `portfolio.css` contains properties, people, and agreement operating views.
- `finance.css` contains invoices, payments, billing policy, and reporting views.
- `operations.css` contains maintenance and reservation operating views.

Do not add new `part-*.css` files. New work must use a named domain layer. When a legacy area is visually certified, move its selectors into the appropriate named file and remove the obsolete compatibility rules in a dedicated refactor.

The load order in `app/globals.css` is intentional: legacy compatibility first, release contracts next, then named layers from broadest to most specific.
