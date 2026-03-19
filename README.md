# PicToColourIn.com

Turn any photo into a printable coloring page - entirely in your browser using GPU acceleration.

## Features

- 🖼️ **Drag & Drop Upload** - Simple photo upload interface
- ⚡ **GPU-Accelerated Processing** - WebGL-powered edge detection
- 🎨 **Real-time Controls** - Adjust smoothing, edge sensitivity, and threshold
- 📄 **Multiple Export Options** - Download PNG, PDF, or print directly
- 📱 **Mobile-Friendly** - Works on all devices
- 🔒 **Privacy-First** - All processing happens on your device, no server needed

## Tech Stack

- Vanilla HTML5/CSS3/JavaScript
- WebGL with custom GLSL shaders
- Zero dependencies
- Static site - deploy anywhere

## Deployment (Cloudflare Pages)

1. Push code to GitHub
2. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
3. Go to **Pages** → **Create a project**
4. Connect your GitHub repository
5. Build settings:
   - **Build command:** (leave empty)
   - **Build output directory:** `/`
6. Click **Save and Deploy**

## Adding Google AdSense

1. Sign up at [Google AdSense](https://www.google.com/adsense)
2. Get your ad unit code
3. Replace the placeholder in `index.html`:

```html
<!-- Replace this: -->
<div class="ad-placeholder">
    <p>AdSpace - 728x90 or responsive</p>
</div>

<!-- With your AdSense code: -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ID"
     crossorigin="anonymous"></script>
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-YOUR_ID"
     data-ad-slot="YOUR_SLOT"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

## How It Works

1. **Gaussian Blur** - Reduces noise in the image
2. **Grayscale Conversion** - Prepares for edge detection
3. **Sobel Edge Detection** - Finds edges using gradient calculation
4. **Threshold** - Converts edges to clean black/white lines
5. **Output** - Creates printable coloring page

All processing is done via WebGL shaders running on the GPU for real-time performance.

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 14+
- iOS Safari 14+
- Chrome Android 80+

Requires WebGL support.

## License

MIT License - feel free to use and modify!
