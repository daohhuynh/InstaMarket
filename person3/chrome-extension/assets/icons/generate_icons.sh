#!/bin/bash
# Run this once to generate placeholder icons if you don't have real ones.
# Requires ImageMagick (brew install imagemagick)
for size in 16 48 128; do
  convert -size ${size}x${size} \
    gradient:"#7c3aed-#00c853" \
    -gravity center \
    -font Helvetica-Bold \
    -pointsize $((size/2)) \
    -fill white \
    -annotate 0 "IM" \
    icon${size}.png
  echo "Created icon${size}.png"
done
