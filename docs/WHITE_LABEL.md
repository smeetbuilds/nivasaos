# White-label branding

NivasaOS ships with the source-controlled identity in `public/brand/nivasaos/`. The vector-source design package is retained at `brand-assets/NivasaOS_Brand_Assets.zip`.

## Change branding from the application

A signed-in user with `settings.manage` permission can open **Settings → Brand identity** and configure:

- product or platform name;
- product tagline;
- horizontal logo for light surfaces;
- horizontal logo for dark surfaces;
- compact symbol for light surfaces;
- compact symbol for dark surfaces;
- browser favicon;
- full white-label mode, which removes the default Aahav Labs attribution from application and resident-portal surfaces.

Custom files are stored under the configured `NIVASA_UPLOAD_DIR` in a dedicated `branding/` directory. Docker Compose already persists that upload directory, and the repository backup/restore workflow includes uploads.

## Accepted uploads

- logos and symbols: PNG, JPG, or WebP;
- favicon: PNG, JPG, WebP, or ICO;
- maximum size: 2 MB per file.

Uploaded SVG is intentionally rejected. The bundled SVG files are reviewed source-controlled assets, while accepting arbitrary SVG from an administration form would create an unnecessary active-content risk.

## Restore the default identity

Select the remove option under a custom asset and save settings. The application immediately falls back to the corresponding bundled NivasaOS asset. Disable full white-label mode to restore the default product attribution.

## Upgrade behavior

Do not replace files inside `public/brand/nivasaos/` for an installation-specific brand. Source-controlled files can change during upgrades. Use the settings upload flow so custom branding remains in persistent storage and survives application image replacement.
