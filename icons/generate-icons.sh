#!/bin/bash

# This script generates PNG icons from the SVG source
# Requires ImageMagick or Inkscape to be installed

# Check if convert (ImageMagick) is available
if command -v convert &> /dev/null; then
    echo "Using ImageMagick to generate icons..."
    convert -background none icon.svg -resize 16x16 icon16.png
    convert -background none icon.svg -resize 48x48 icon48.png
    convert -background none icon.svg -resize 128x128 icon128.png
    echo "Icons generated successfully!"
# Check if inkscape is available
elif command -v inkscape &> /dev/null; then
    echo "Using Inkscape to generate icons..."
    inkscape icon.svg -w 16 -h 16 -o icon16.png
    inkscape icon.svg -w 48 -h 48 -o icon48.png
    inkscape icon.svg -w 128 -h 128 -o icon128.png
    echo "Icons generated successfully!"
else
    echo "Error: Neither ImageMagick nor Inkscape found."
    echo "Please install one of these tools:"
    echo "  - ImageMagick: sudo apt-get install imagemagick (Linux) or brew install imagemagick (Mac)"
    echo "  - Inkscape: sudo apt-get install inkscape (Linux) or brew install inkscape (Mac)"
    echo ""
    echo "Alternatively, use an online converter:"
    echo "  1. Go to https://cloudconvert.com/svg-to-png"
    echo "  2. Upload icon.svg"
    echo "  3. Set width/height to 16, 48, and 128 pixels"
    echo "  4. Download and rename to icon16.png, icon48.png, icon128.png"
    exit 1
fi
