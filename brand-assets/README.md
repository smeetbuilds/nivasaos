# NivasaOS brand assets

Trusted runtime SVG assets are stored in `public/brand/nivasaos/` as normal source-controlled files so changes remain reviewable and diffable. Binary ZIP bundles are intentionally not committed; release-specific downloadable asset bundles belong in GitHub Release assets.

Do not edit runtime defaults to white-label an installation. Users with `settings.manage` permission can replace the product name, tagline, light/dark logos, symbols, and favicon from **Settings → Brand identity**. Custom assets are stored in the persistent NivasaOS upload volume and survive application image upgrades.

For security, UI uploads accept raster PNG, JPG, WebP, and ICO files only. The bundled SVG files are source-controlled and trusted; arbitrary uploaded SVG is deliberately rejected.
