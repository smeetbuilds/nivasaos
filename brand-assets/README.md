# NivasaOS brand assets

`NivasaOS_Brand_Assets.zip` contains the supplied vector-source package: every horizontal, stacked, symbol, and favicon variant in light and dark SVG format, plus the original usage notes.

Runtime defaults are copied into `public/brand/nivasaos/`. Do not edit those files to white-label an installation. Users with `settings.manage` permission can replace the product name, tagline, light/dark logos, symbols, and favicon from **Settings → Brand identity**. Custom assets are stored in the persistent NivasaOS upload volume and survive application image upgrades.

For security, UI uploads accept raster PNG, JPG, WebP, and ICO files only. The bundled SVG files are source-controlled and trusted; arbitrary uploaded SVG is deliberately rejected.
