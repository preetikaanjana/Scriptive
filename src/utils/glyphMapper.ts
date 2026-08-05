/**
 * Glyph Mapper System
 * Generates and caches cropped transparent PNG variations for alphanumeric characters and symbols.
 * This completely replaces direct vector text rendering with an image-based drawing loop.
 */

// Cache structure: fontName -> { character: [dataUrl_var1, dataUrl_var2, dataUrl_var3] }
const glyphCache: Record<string, Record<string, string[]>> = {};

// Characters to support in our custom image-based stitching engine
const CHAR_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-+=():;\"'/\\&@$#%*";

/**
 * Procedurally generates transparent PNG data URLs for all characters of a font.
 * Renders each character onto a temporary canvas, crops it horizontally to its ink boundaries
 * to preserve vertical baseline alignments, applies organic perturbations, and saves it.
 */
export function generateGlyphsForFont(fontName: string): Record<string, string[]> {
    const fontKey = fontName.toLowerCase();
    if (glyphCache[fontKey]) {
        return glyphCache[fontKey];
    }

    console.log(`Procedurally generating custom PNG glyphs for font: ${fontName}...`);
    const charMap: Record<string, string[]> = {};

    // Standard canvas parameters
    const sourceHeight = 128;
    const targetHeight = 64;
    const scaleFactor = targetHeight / sourceHeight; // 0.5x scaling for high-quality antialiasing
    const baselineY = 90; // vertical baseline location inside 128px high source canvas

    // Create scratch canvases
    const canvas = document.createElement('canvas');
    canvas.width = sourceHeight;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return {};
    }

    // Generate variants for each character
    for (let i = 0; i < CHAR_SET.length; i++) {
        const char = CHAR_SET[i];
        charMap[char] = [];

        // Generate 3 variations per character to simulate natural handwriting differences
        for (let varIdx = 0; varIdx < 3; varIdx++) {
            ctx.clearRect(0, 0, sourceHeight, sourceHeight);

            // Draw text
            ctx.font = `56px "${fontName}", cursive, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';

            ctx.save();
            ctx.translate(sourceHeight / 2, baselineY);

            // 1. Organic slant rotation (between -3 and +3 degrees)
            const rotation = (Math.random() - 0.5) * 0.1;
            ctx.rotate(rotation);

            // 2. Organic scaling (stretch/shrink height and width independently)
            const scaleX = 0.92 + Math.random() * 0.16;
            const scaleY = 0.92 + Math.random() * 0.16;
            ctx.scale(scaleX, scaleY);

            // 3. Organic translation nudge (micro offsets)
            const dx = (Math.random() - 0.5) * 3;
            const dy = (Math.random() - 0.5) * 3;

            // Draw the character relative to the translated origin
            ctx.fillText(char, dx, dy);
            ctx.restore();

            // Analyze pixels to crop horizontally
            const imgData = ctx.getImageData(0, 0, sourceHeight, sourceHeight);
            const data = imgData.data;

            let minX = sourceHeight;
            let maxX = 0;
            let hasInk = false;

            for (let y = 0; y < sourceHeight; y++) {
                for (let x = 0; x < sourceHeight; x++) {
                    const idx = (y * sourceHeight + x) * 4;
                    const alpha = data[idx + 3];
                    if (alpha > 10) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        hasInk = true;

                        // Force ink color to pure black in the base template, keeping alpha anti-aliasing
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                    }
                }
            }

            if (!hasInk) {
                // If text drawing failed or has no ink, push a default sized empty canvas
                const emptyCanvas = document.createElement('canvas');
                emptyCanvas.width = 16;
                emptyCanvas.height = targetHeight;
                charMap[char].push(emptyCanvas.toDataURL('image/png'));
                continue;
            }

            // Write modified black ink pixels back to temp canvas
            ctx.putImageData(imgData, 0, 0);

            // Crop horizontally with a 2px safety padding, keeping full vertical scale (128px)
            const padding = 2;
            const cropX = Math.max(0, minX - padding);
            const cropW = Math.min(sourceHeight - cropX, maxX - minX + 1 + padding * 2);

            // Scale to targetHeight (64px)
            const finalWidth = Math.max(4, Math.round(cropW * scaleFactor));
            const finalHeight = targetHeight;

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = finalWidth;
            cropCanvas.height = finalHeight;
            const cropCtx = cropCanvas.getContext('2d');

            if (cropCtx) {
                cropCtx.drawImage(
                    canvas,
                    cropX, 0, cropW, sourceHeight, // source
                    0, 0, finalWidth, finalHeight   // destination (scaled)
                );
                charMap[char].push(cropCanvas.toDataURL('image/png'));
            }
        }
    }

    // Generate space character variant (simple spacing block)
    charMap[' '] = [];
    for (let varIdx = 0; varIdx < 3; varIdx++) {
        const spaceCanvas = document.createElement('canvas');
        spaceCanvas.width = 18 + Math.round((Math.random() - 0.5) * 4); // spacing variations
        spaceCanvas.height = targetHeight;
        charMap[' '].push(spaceCanvas.toDataURL('image/png'));
    }

    glyphCache[fontKey] = charMap;
    return charMap;
}

/**
 * Retrieves the generated transparent PNG variant data URLs for a given character.
 * Falls back to auto-generating if the font cache is empty.
 */
export function getGlyphVariants(fontName: string, char: string): string[] {
    const fontKey = fontName.toLowerCase();
    let map = glyphCache[fontKey];
    if (!map) {
        map = generateGlyphsForFont(fontName);
    }
    return map[char] || map[' '] || [];
}
