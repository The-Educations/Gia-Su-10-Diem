# Login illustration

`auth-study.webp` is an original, transparent 1200 × 1200 WebP illustration: an open burgundy notebook, a sage book and a terracotta pencil. It uses only procedural geometry and materials; no third-party artwork, fonts or textures are embedded.

The composition was rendered in Blender 5.2.1 using `scripts/generate-auth-art.py`. The supplied login reference informed the two-column page layout, not the illustration itself. No image-generation API or OpenDesign service was used.

To regenerate:

```sh
blender --background --factory-startup --python scripts/generate-auth-art.py -- /tmp/auth-study.png
node --input-type=module -e "import sharp from 'sharp'; await sharp('/tmp/auth-study.png').resize(1200).webp({quality:88,alphaQuality:100}).toFile('assets/auth-study.webp');"
```
