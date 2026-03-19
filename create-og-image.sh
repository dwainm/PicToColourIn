#!/bin/bash
# Quick OG Image Generator Instructions
# 
# The site needs an Open Graph image at: /og-image.jpg
# Dimensions: 1200 x 630 pixels (Facebook/LinkedIn standard)
# 
# This image appears when your site is shared on social media.
# 
# RECOMMENDED DESIGN:
# - Split screen: Left side = original photo, Right side = coloring page output
# - Text overlay: "Free Photo to Coloring Page Converter"
# - Subtext: "Turn any photo into printable coloring pages instantly"
# - Brand: PicToColourIn.com (bottom corner)
# - Background: Dark gradient matching site theme (#0f172a to #6366f1)
# 
# FREE TOOLS TO CREATE:
# 1. Canva (https://canva.com)
#    - Create custom size: 1200 x 630
#    - Templates: Search "Facebook ad" and modify
#    - Upload before/after screenshots from your tool
# 
# 2. Figma (https://figma.com)
#    - New file → Frame → 1200 x 630
#    - Add images and text
#    - Export as JPG
# 
# 3. Photopea (https://photopea.com)
#    - Free Photoshop alternative in browser
#    - New file: 1200x630, 72 DPI
# 
# QUICK CANVA STEPS:
# 1. Go to canva.com (free signup)
# 2. Click "Create a design" → "Custom size"
# 3. Enter 1200 x 630 pixels
# 4. Background: Dark gradient (matching your site's #0f172a)
# 5. Add your before/after images (take screenshots from the site)
# 6. Add text: "Free Photo to Coloring Page Converter"
#    - Font: Bold, white, centered
# 7. Download as JPG (high quality)
# 8. Upload to site root as og-image.jpg
#
# ALTERNATIVE: Use a screenshot
# If you don't want to design, just take a clean screenshot of the 
# site showing the tool in action, crop to 1200x630, and upload.

echo "==================================="
echo "OG Image Generator Instructions"
echo "==================================="
echo ""
echo "Create a 1200x630 JPG image and save as:"
echo "  /Users/dwain/projects/PicToColourIn.com/og-image.jpg"
echo ""
echo "Recommended content:"
echo "  - Split screen: Photo on left, Coloring page on right"
echo "  - Text: 'Free Photo to Coloring Page Converter'"
echo "  - Dark gradient background"
echo ""
echo "Once created, deploy with:"
echo "  git add og-image.jpg"
echo "  git commit -m 'Add Open Graph image for social sharing'"
echo "  git push"
