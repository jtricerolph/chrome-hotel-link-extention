# Extension Icons

The extension requires PNG icons in three sizes: 16x16, 48x48, and 128x128 pixels.

## Option 1: Generate from SVG (Recommended)

Use the provided `icon.svg` file and run:

```bash
./generate-icons.sh
```

This requires ImageMagick or Inkscape installed.

## Option 2: Use Online Converter

1. Go to https://cloudconvert.com/svg-to-png or https://ezgif.com/svg-to-png
2. Upload `icon.svg`
3. Convert to PNG at these sizes:
   - 16x16 pixels → save as `icon16.png`
   - 48x48 pixels → save as `icon48.png`
   - 128x128 pixels → save as `icon128.png`
4. Place all PNG files in this `icons/` directory

## Option 3: Create Custom Icons

Create your own PNG icons using any graphic design tool:
- Design a square icon (128x128 recommended)
- Export at 16px, 48px, and 128px
- Name them: `icon16.png`, `icon48.png`, `icon128.png`
- Place them in this directory

## Temporary Workaround

For testing purposes, you can create simple colored square PNGs or download placeholder icons from:
- https://via.placeholder.com/16/667eea/FFFFFF?text=AT (16x16)
- https://via.placeholder.com/48/667eea/FFFFFF?text=AT (48x48)
- https://via.placeholder.com/128/667eea/FFFFFF?text=AT (128x128)

Save these as icon16.png, icon48.png, and icon128.png respectively.
