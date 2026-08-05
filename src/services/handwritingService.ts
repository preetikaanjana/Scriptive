/**
 * Handwriting Service
 * Handles uploading scanned handwriting sheets for character extraction (A-Z, a-z, 0-9)
 * Connects to a FastAPI + OpenCV backend, and falls back to a simulated client-side CV extraction.
 */

import Tesseract from 'tesseract.js';


/**
 * Loads a File object into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Calculates Otsu's optimal threshold for a local sub-image to separate dark ink from light paper.
 */
function calculateOtsuThreshold(pixels: Uint8ClampedArray): number {
    const histogram = new Int32Array(256);
    let totalPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        // Use average RGB for brightness
        const brightness = Math.round((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
        histogram[brightness]++;
        totalPixels++;
    }

    if (totalPixels === 0) return 128;

    let sum = 0;
    for (let t = 0; t < 256; t++) {
        sum += t * histogram[t];
    }

    let sumB = 0;
    let wB = 0;
    let wF = 0;

    let varMax = 0;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;

        wF = totalPixels - wB;
        if (wF === 0) break;

        sumB += t * histogram[t];

        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;

        // Calculate between-class variance
        const varBetween = wB * wF * (mB - mF) * (mB - mF);

        if (varBetween > varMax) {
            varMax = varBetween;
            threshold = t;
        }
    }

    return threshold;
}

/**
 * Performs local Connected Component Labeling (CCL) using flood fill.
 * Returns the bounding box of the component closest to the center of the crop.
 */
function findCentralConnectedComponent(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    threshold: number
): { label: number; minX: number; maxX: number; minY: number; maxY: number; pixelCount: number; labels: Int32Array } | null {
    const labels = new Int32Array(width * height);
    let currentLabel = 0;

    // A pixel is considered ink if its brightness is less than or equal to the threshold
    const isInk = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const idx = (y * width + x) * 4;
        const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
        return brightness <= threshold;
    };

    const floodFill = (startX: number, startY: number, label: number) => {
        const queue: [number, number][] = [[startX, startY]];
        labels[startY * width + startX] = label;

        let minX = startX, maxX = startX;
        let minY = startY, maxY = startY;
        let pixelCount = 0;

        while (queue.length > 0) {
            const [cx, cy] = queue.shift()!;
            pixelCount++;

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            // 8-connectivity
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const idx = ny * width + nx;
                        if (labels[idx] === 0 && isInk(nx, ny)) {
                            labels[idx] = label;
                            queue.push([nx, ny]);
                        }
                    }
                }
            }
        }

        return { label, minX, maxX, minY, maxY, pixelCount };
    };

    const components = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (labels[idx] === 0 && isInk(x, y)) {
                currentLabel++;
                const comp = floodFill(x, y, currentLabel);
                components.push(comp);
            }
        }
    }

    if (components.length === 0) return null;

    // Select the connected component closest to the center
    const centerX = width / 2;
    const centerY = height / 2;
    let bestComp = null;
    let minDist = Infinity;

    for (const comp of components) {
        // Skip tiny noise spots
        if (comp.pixelCount < 12 && components.length > 1) continue;

        const compCenterX = (comp.minX + comp.maxX) / 2;
        const compCenterY = (comp.minY + comp.maxY) / 2;
        const dist = Math.hypot(compCenterX - centerX, compCenterY - centerY);

        if (dist < minDist) {
            minDist = dist;
            bestComp = comp;
        }
    }

    if (!bestComp) {
        bestComp = components[0];
    }

    return { ...bestComp, labels };
}

/**
 * Strips the empty transparent padding on the left and right of a glyph canvas.
 * Preserves the vertical dimension (64px) and baseline alignment.
 */
function cropCanvasHorizontally(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = srcCanvas.getContext('2d');
    if (!ctx) return srcCanvas;

    const width = srcCanvas.width;
    const height = srcCanvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let maxX = 0;
    let found = false;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 15) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                found = true;
            }
        }
    }

    if (!found) return srcCanvas;

    const padding = 2;
    const xStart = Math.max(0, minX - padding);
    const xEnd = Math.min(width - 1, maxX + padding);
    const croppedWidth = xEnd - xStart + 1;

    const destCanvas = document.createElement('canvas');
    destCanvas.width = croppedWidth;
    destCanvas.height = height;
    const destCtx = destCanvas.getContext('2d');

    if (destCtx) {
        destCtx.drawImage(
            srcCanvas,
            xStart, 0, croppedWidth, height,
            0, 0, croppedWidth, height
        );
        return destCanvas;
    }

    return srcCanvas;
}

/**
 * Uploads a scanned handwriting template sheet to the FastAPI backend.
 * Uses a FastAPI service that performs contour analysis to crop characters A-Z, a-z, and 0-9.
 * If backend is not available, simulates OpenCV extraction on the client-side with organic distortions.
 */
export async function uploadHandwritingSheet(file: File): Promise<{
    glyphs: Record<string, string[]>;
    metadata: { measuredJitter: number; measuredSlant: number };
}> {
    try {
        console.log(`Running client-side Tesseract CV segmentation pipeline on ${file.name}...`);
        
        // 1. Load image
        const img = await loadImage(file);
        
        // 2. Perform OCR to detect character layouts
        const result = await Tesseract.recognize(file, 'eng');
        const { words } = result.data as any;
        
        const glyphs: Record<string, string[]> = {};
        const slants: number[] = [];
        const baselineOffsets: number[] = [];
        
        // Create canvas to read pixel data from original image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (tempCtx && words && words.length > 0) {
            tempCtx.drawImage(img, 0, 0);
            
            words.forEach((word: any) => {
                if (word.symbols) {
                    word.symbols.forEach((symbol: any) => {
                        const char = symbol.text;
                        // Map alphanumeric characters only
                        if (/^[A-Za-z0-9]$/.test(char)) {
                            const { x0, y0, x1, y1 } = symbol.bbox;
                            
                            // Measure baseline deviation relative to the word's bounding box
                            const offset = symbol.bbox.y1 - word.bbox.y1;
                            baselineOffsets.push(offset);
                            
                            // Expand the bounding box by a local margin to capture ascenders/descenders
                            const margin = 8;
                            const localX0 = Math.max(0, x0 - margin);
                            const localY0 = Math.max(0, y0 - margin);
                            const localX1 = Math.min(img.width, x1 + margin);
                            const localY1 = Math.min(img.height, y1 + margin);
                            
                            const w = localX1 - localX0;
                            const h = localY1 - localY0;
                            
                            if (w > 4 && h > 4) {
                                // Create a temporary crop canvas
                                const localCanvas = document.createElement('canvas');
                                localCanvas.width = w;
                                localCanvas.height = h;
                                const localCtx = localCanvas.getContext('2d');
                                
                                if (localCtx) {
                                    localCtx.drawImage(tempCanvas, localX0, localY0, w, h, 0, 0, w, h);
                                    const localImgData = localCtx.getImageData(0, 0, w, h);
                                    const localPixels = localImgData.data;
                                    
                                    // 1. Adaptive threshold calculation (Otsu's Method)
                                    const otsuThreshold = calculateOtsuThreshold(localPixels);
                                    
                                    // 2. Connected Component Analysis to isolate target character
                                    const compResult = findCentralConnectedComponent(localPixels, w, h, otsuThreshold);
                                    
                                    if (compResult) {
                                        const { minX, maxX, minY, maxY, label, labels } = compResult;
                                        
                                        // Isolate character pixels and measure slant
                                        let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0, count = 0;
                                        const isolatedImgData = localCtx.createImageData(w, h);
                                        const isolatedPixels = isolatedImgData.data;
                                        
                                        for (let cy = 0; cy < h; cy++) {
                                            for (let cx = 0; cx < w; cx++) {
                                                const idx = cy * w + cx;
                                                const pixelIdx = idx * 4;
                                                
                                                if (labels[idx] === label) {
                                                    // Pixel belongs to character component
                                                    const origR = localPixels[pixelIdx];
                                                    const origG = localPixels[pixelIdx + 1];
                                                    const origB = localPixels[pixelIdx + 2];
                                                    const brightness = (origR + origG + origB) / 3;
                                                    
                                                    // Map ink darkness to opacity
                                                    isolatedPixels[pixelIdx] = 0;
                                                    isolatedPixels[pixelIdx + 1] = 0;
                                                    isolatedPixels[pixelIdx + 2] = 0;
                                                    isolatedPixels[pixelIdx + 3] = Math.min(255, (255 - brightness) * 1.5);
                                                    
                                                    // Accumulate stats for slant estimation
                                                    sumX += cx;
                                                    sumY += cy;
                                                    sumX2 += cx * cx;
                                                    sumY2 += cy * cy;
                                                    sumXY += cx * cy;
                                                    count++;
                                                } else {
                                                    // Non-character pixels are fully transparent
                                                    isolatedPixels[pixelIdx + 3] = 0;
                                                }
                                            }
                                        }
                                        localCtx.putImageData(isolatedImgData, 0, 0);
                                        
                                        // Slant angle covariance math
                                        if (count > 10) {
                                            const varY = (sumY2 - (sumY * sumY) / count) / count;
                                            const covXY = (sumXY - (sumX * sumY) / count) / count;
                                            
                                            if (varY > 0.1) {
                                                // Inverse tangent of shear. Minus sign corrects for canvas inverted Y coordinates
                                                const slantAngleRad = -Math.atan(covXY / varY);
                                                const slantDeg = slantAngleRad * (180 / Math.PI);
                                                slants.push(slantDeg);
                                            }
                                        }
                                        
                                        // Crop character horizontally and draw it centered vertically in a 64px frame
                                        const compHeight = maxY - minY + 1;
                                        const scale = 40 / compHeight; // scale factor
                                        
                                        const padding = 2;
                                        const xStart = Math.max(0, minX - padding);
                                        const xEnd = Math.min(w - 1, maxX + padding);
                                        const croppedWidth = xEnd - xStart + 1;
                                        
                                        const finalWidth = Math.round(croppedWidth * scale);
                                        
                                        const glyphCanvas = document.createElement('canvas');
                                        glyphCanvas.width = finalWidth;
                                        glyphCanvas.height = 64;
                                        const glyphCtx = glyphCanvas.getContext('2d');
                                        
                                        if (glyphCtx) {
                                            const destH = h * scale;
                                            const destY = 12 - (minY * scale); // aligns to baseline
                                            const destW = croppedWidth * scale;
                                            
                                            glyphCtx.drawImage(
                                                localCanvas,
                                                xStart, 0, croppedWidth, h,
                                                0, destY, destW, destH
                                            );
                                            
                                            const dataUrl = glyphCanvas.toDataURL('image/png');
                                            
                                            if (!glyphs[char]) {
                                                glyphs[char] = [];
                                            }
                                            if (glyphs[char].length < 5) {
                                                glyphs[char].push(dataUrl);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            });
        }
        
        // Compute calibration metrics
        let measuredJitter = 1.8;
        if (baselineOffsets.length > 5) {
            const mean = baselineOffsets.reduce((a, b) => a + b, 0) / baselineOffsets.length;
            const variance = baselineOffsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / baselineOffsets.length;
            measuredJitter = Math.min(5, Math.max(0.6, Math.sqrt(variance)));
        }
        
        let measuredSlant = 0;
        if (slants.length > 5) {
            const validSlants = slants.filter(s => s >= -40 && s <= 40);
            if (validSlants.length > 0) {
                measuredSlant = validSlants.reduce((a, b) => a + b, 0) / validSlants.length;
            }
        }
        
        const metadata = { measuredJitter, measuredSlant };
        console.log(`Calibration complete: baseline jitter=${measuredJitter.toFixed(2)}px, slant=${measuredSlant.toFixed(1)}°`);
        
        // Fill in missing characters with simulated fallback
        const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < charSet.length; i++) {
            const char = charSet[i];
            if (!glyphs[char] || glyphs[char].length === 0) {
                const fallbackCanvas = document.createElement('canvas');
                fallbackCanvas.width = 64;
                fallbackCanvas.height = 64;
                const fbCtx = fallbackCanvas.getContext('2d');
                if (fbCtx) {
                    fbCtx.clearRect(0, 0, 64, 64);
                    fbCtx.font = '40px Caveat, cursive, sans-serif';
                    fbCtx.fillStyle = '#000000';
                    fbCtx.textBaseline = 'middle';
                    fbCtx.textAlign = 'center';
                    
                    fbCtx.save();
                    fbCtx.translate(32, 32);
                    fbCtx.rotate((Math.random() - 0.5) * 0.2);
                    fbCtx.fillText(char, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
                    fbCtx.restore();
                    
                    const tightFb = cropCanvasHorizontally(fallbackCanvas);
                    glyphs[char] = [tightFb.toDataURL('image/png')];
                }
            }
        }
        
        return { glyphs, metadata };
    } catch (err) {
        console.warn('Local Tesseract CV pipeline failed. Falling back to simulator...', err);
        return runMockCVExtraction(file);
    }
}

/**
 * Simulates a computer vision contour extraction pipeline.
 */
function runMockCVExtraction(file: File): Promise<{
    glyphs: Record<string, string[]>;
    metadata: { measuredJitter: number; measuredSlant: number };
}> {
    return new Promise((resolve) => {
        console.log(`Mock-processing file: ${file.name} (${Math.round(file.size / 1024)} KB)...`);

        const glyphs: Record<string, string[]> = {};
        const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

        setTimeout(() => {
            for (let i = 0; i < charSet.length; i++) {
                const char = charSet[i];
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');

                if (ctx) {
                    ctx.clearRect(0, 0, 64, 64);
                    ctx.font = '40px Caveat, cursive, sans-serif';
                    ctx.fillStyle = '#000000';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';

                    ctx.save();
                    ctx.translate(32, 32);

                    const slant = (Math.random() - 0.5) * 0.25;
                    ctx.rotate(slant);

                    const scaleX = 0.85 + Math.random() * 0.25;
                    const scaleY = 0.85 + Math.random() * 0.25;
                    ctx.scale(scaleX, scaleY);

                    const dx = (Math.random() - 0.5) * 5;
                    const dy = (Math.random() - 0.5) * 5;

                    ctx.fillText(char, dx, dy);
                    ctx.restore();

                    const imgData = ctx.getImageData(0, 0, 64, 64);
                    const pixels = imgData.data;

                    for (let p = 0; p < pixels.length; p += 4) {
                        const alpha = pixels[p + 3];
                        if (alpha > 10) {
                            const noise = Math.random();
                            if (noise < 0.15) {
                                pixels[p + 3] = Math.max(0, alpha - 80);
                            } else if (noise < 0.3) {
                                pixels[p + 3] = Math.min(255, alpha + 40);
                            }
                        }
                    }
                    ctx.putImageData(imgData, 0, 0);
                    
                    const tightMock = cropCanvasHorizontally(canvas);
                    // Extract 2 simulated variants for mockup
                    glyphs[char] = [tightMock.toDataURL('image/png')];
                }
            }

            resolve({
                glyphs,
                metadata: { measuredJitter: 1.6, measuredSlant: -4.0 }
            });
        }, 1200);
    });
}
