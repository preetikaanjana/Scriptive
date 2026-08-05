import { useEffect, useRef, useState } from 'react';
import type { PageData, PaperMaterial, LineData, GlyphMetadata } from '../types';
import { generateGlyphsForFont } from '../utils/glyphMapper';

interface CanvasRendererProps {
    page: PageData;
    pageIndex: number;
    font: string;
    fontSize: number;
    color: string;
    paperMaterial: PaperMaterial;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    jitter: number;
    pressure: number;
    smudge: number;
    baseline: number;
    textAlign: 'left' | 'center' | 'right' | 'justify';
    randomSeed: number;
    showHeader: boolean;
    headerText: string;
    showPageNumbers: boolean;
    totalPages: number;
    customGlyphs: Record<string, string[]> | null;
    customGlyphsMetadata: GlyphMetadata | null;
    letterSpacing: number;
}

// Deterministic random number generator helper
function getDeterminRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
}

// Offscreen canvas tint cache
const tintCache: Record<string, HTMLCanvasElement> = {};

function getTintedGlyph(imgKey: string, img: HTMLImageElement, color: string): HTMLCanvasElement {
    const key = `${imgKey}-${color}`;
    if (tintCache[key]) return tintCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, img.width, img.height);
    }
    tintCache[key] = canvas;
    return canvas;
}

export default function CanvasRenderer({
    page,
    pageIndex,
    font,
    fontSize,
    color,
    paperMaterial,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    jitter,
    pressure,
    smudge,
    baseline,
    textAlign,
    randomSeed,
    showHeader,
    headerText,
    showPageNumbers,
    totalPages,
    customGlyphs,
    customGlyphsMetadata,
    letterSpacing
}: CanvasRendererProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const glyphImagesRef = useRef<Record<string, HTMLImageElement>>({});

    const baseWidth = 800;
    const baseHeight = 1131; // A4 ratio 800 * 1.414 = ~1131px
    const resolutionQuality = 2; // Render at 2x internally for high-DPI export

    // 1. Preload custom glyphs (either user-uploaded or procedural font variants)
    useEffect(() => {
        // Source map: use user-uploaded custom glyphs or generate procedural font PNG glyphs
        const sourceMap = customGlyphs ? customGlyphs : generateGlyphsForFont(font);
        
        const chars = Object.keys(sourceMap);
        
        // Sum total images across all character variant lists, supporting legacy string schemas
        const totalImages = chars.reduce((sum, c) => {
            const val = sourceMap[c];
            return sum + (Array.isArray(val) ? val.length : 1);
        }, 0);

        if (totalImages === 0) {
            setImagesLoaded(true);
            return;
        }

        let loadedCount = 0;
        setImagesLoaded(false);
        glyphImagesRef.current = {};

        chars.forEach((char) => {
            const val = sourceMap[char];
            if (val) {
                const urls = Array.isArray(val) ? val : [val];
                urls.forEach((dataUrl, index) => {
                    const imgKey = `${char}-${index}`;
                    const img = new Image();
                    img.src = dataUrl;
                    img.onload = () => {
                        glyphImagesRef.current[imgKey] = img;
                        loadedCount++;
                        if (loadedCount === totalImages) {
                            setImagesLoaded(true);
                        }
                    };
                    img.onerror = () => {
                        loadedCount++;
                        if (loadedCount === totalImages) {
                            setImagesLoaded(true);
                        }
                    };
                });
            }
        });
    }, [customGlyphs, font]);

    // 2. Perform Canvas Rendering
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set resolution for high-DPI sharpness
        canvas.width = baseWidth * resolutionQuality;
        canvas.height = baseHeight * resolutionQuality;
        
        ctx.save();
        ctx.scale(resolutionQuality, resolutionQuality);

        // --- STAGE 1: PAPER BACKGROUNDS ---
        drawPaperBackground(ctx, paperMaterial, randomSeed);

        // --- STAGE 2: PAPER LINES / DOTS / MARGINS ---
        const lineHeight = 32; // Default baseline step
        drawPaperGrids(ctx, paperMaterial, marginTop, marginBottom, marginLeft, marginRight, lineHeight);

        // --- STAGE 3: CHARACTER RENDERING (Image stitching) ---
        if (imagesLoaded) {
            const lineYOffset = marginTop;
            const headerLines = showHeader && pageIndex === 0 ? headerText.split('\n') : [];
            const headerHeight = headerLines.length > 0 ? (headerLines.length + 1) * lineHeight : 0;
            
            // Set multiply blending so ink blends into paper lines
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';

            // Draw Header Text (Page 1 Only)
            if (pageIndex === 0 && headerLines.length > 0) {
                headerLines.forEach((hLine, hlIdx) => {
                    const lineSeedBase = `header-${hlIdx}-${randomSeed}`;
                    const drawY = lineYOffset + hlIdx * lineHeight + (lineHeight * 0.75) + baseline;
                    drawTextLine(ctx, hLine, drawY, lineSeedBase, true);
                });
            }

            // Draw Body Text Lines
            page.lines.forEach((line: LineData, lIdx: number) => {
                const lineSeedBase = `${pageIndex}-${lIdx}-${randomSeed}`;
                // Adjust start Y depending on header height
                const startY = lineYOffset + (pageIndex === 0 ? headerHeight : 0);
                const drawY = startY + lIdx * lineHeight + (lineHeight * 0.75) + baseline;
                drawTextLine(ctx, line.text, drawY, lineSeedBase, false, line.indent);
            });

            ctx.restore();
        }

        // --- STAGE 4: PAGE NUMBERS ---
        if (showPageNumbers) {
            ctx.save();
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#9ca3af'; // light gray
            ctx.textAlign = 'center';
            ctx.fillText(
                `PAGE ${pageIndex + 1} OF ${totalPages}`,
                baseWidth / 2,
                baseHeight - 24
            );
            ctx.restore();
        }

        // --- STAGE 5: PAPER TEXTURE OVERLAY (globalCompositeOperation = 'multiply') ---
        drawPaperTextureOverlay(ctx, paperMaterial);

        ctx.restore();
    }, [
        page,
        pageIndex,
        font,
        fontSize,
        color,
        paperMaterial,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        jitter,
        pressure,
        smudge,
        baseline,
        textAlign,
        randomSeed,
        showHeader,
        headerText,
        showPageNumbers,
        totalPages,
        imagesLoaded
    ]);

    // Sub-routine to draw the background paper
    function drawPaperBackground(ctx: CanvasRenderingContext2D, material: PaperMaterial, seed: number) {
        if (material === 'aged') {
            const grad = ctx.createRadialGradient(baseWidth / 2, baseHeight / 2, 100, baseWidth / 2, baseHeight / 2, 800);
            grad.addColorStop(0, '#fdfbf7');
            grad.addColorStop(0.5, '#f5edd6');
            grad.addColorStop(1, '#e4d2a3');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, baseWidth, baseHeight);

            // Add organic brown aged mottling spots
            ctx.save();
            ctx.filter = 'blur(40px)';
            ctx.fillStyle = 'rgba(139, 92, 26, 0.035)'; // very soft brown
            for (let i = 0; i < 8; i++) {
                const spotX = getDeterminRandom(`aged-x-${i}-${seed}`) * baseWidth;
                const spotY = getDeterminRandom(`aged-y-${i}-${seed}`) * baseHeight;
                const spotR = 80 + getDeterminRandom(`aged-r-${i}-${seed}`) * 160;
                ctx.beginPath();
                ctx.arc(spotX, spotY, spotR, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, baseWidth, baseHeight);
        }
    }

    // Sub-routine to draw ruled notebook lines, dot grid, and margin dividers
    function drawPaperGrids(
        ctx: CanvasRenderingContext2D,
        material: PaperMaterial,
        marginTop: number,
        marginBottom: number,
        marginLeft: number,
        marginRight: number,
        lineHeight: number
    ) {
        // Red vertical notebook margin line
        if (material !== 'white') {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)'; // notebook pinkish red
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(marginLeft - 15, 0); // slightly left of text margin
            ctx.lineTo(marginLeft - 15, baseHeight);
            ctx.stroke();
        }

        // Ruled Notebook Lines
        if (material === 'ruled' || material === 'aged') {
            ctx.strokeStyle = 'rgba(30, 64, 175, 0.09)'; // light blue-gray notebook rule lines
            ctx.lineWidth = 1;

            const startY = marginTop;
            const endY = baseHeight - marginBottom;

            for (let y = startY; y < endY; y += lineHeight) {
                ctx.beginPath();
                ctx.moveTo(marginLeft - 15, y + (lineHeight * 0.75) + baseline);
                ctx.lineTo(baseWidth - marginRight, y + (lineHeight * 0.75) + baseline);
                ctx.stroke();
            }
        }

        // Dot Grid Pattern
        if (material === 'dotted') {
            ctx.fillStyle = 'rgba(156, 163, 175, 0.25)'; // light gray dots

            const startY = marginTop;
            const endY = baseHeight - marginBottom;
            const startX = marginLeft;
            const endX = baseWidth - marginRight;

            for (let y = startY; y < endY; y += lineHeight) {
                for (let x = startX; x < endX; x += lineHeight) {
                    ctx.beginPath();
                    ctx.arc(x, y + (lineHeight * 0.75) + baseline, 1, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // Sub-routine to draw a single text line word-by-word and character-by-character
    function drawTextLine(
        ctx: CanvasRenderingContext2D,
        lineText: string,
        lineBaselineY: number,
        lineSeedBase: string,
        isHeader = false,
        indent = 0
    ) {
        if (!lineText.trim()) return;

        const words = lineText.split(' ');
        const rightLimit = baseWidth - marginRight;
        const textWidthLimit = rightLimit - marginLeft;

        // Resolve source map
        const sourceMap = customGlyphs ? customGlyphs : generateGlyphsForFont(font);
        
        // Measure dynamic space width
        const spaceUrls = sourceMap[' '];
        const spaceSeed = `${lineSeedBase}-space`;
        const spaceVarIdx = Math.floor(getDeterminRandom(spaceSeed) * (spaceUrls?.length || 3));
        const spaceKey = ` -${spaceVarIdx}`;
        const spaceImg = glyphImagesRef.current[spaceKey];
        // Calculate dynamic space width based on image size or fallback
        const spaceWidth = spaceImg 
            ? Math.round((spaceImg.width / spaceImg.height) * (fontSize * 1.15)) 
            : 18 + Math.round((getDeterminRandom(spaceSeed + '-sz') - 0.5) * 4);

        // --- GLYPH LAYOUT PASS: Calculate character widths and slants ---
        let totalLineWidth = 0;
        const layoutWords = words.map((word, wIdx) => {
            const wordSeed = `${lineSeedBase}-w-${wIdx}`;
            
            // Per-word rotation to simulate hand fatigue (max +/-1.5 degrees, scaled by jitter)
            const maxRotationRad = 1.5 * (Math.PI / 180);
            const wordRotation = (getDeterminRandom(wordSeed + '-r') - 0.5) * 2 * maxRotationRad * (jitter / 6);

            let wordWidth = 0;
            const charSpecs = [];

            for (let cIdx = 0; cIdx < word.length; cIdx++) {
                const char = word[cIdx];
                const charSeed = `${wordSeed}-c-${cIdx}`;

                // 1. Baseline Jitter (±1px to ±2.5px, calibrated if metadata is active)
                const baseJitterRange = customGlyphsMetadata 
                    ? customGlyphsMetadata.measuredJitter * (jitter / 6)
                    : 1 + (jitter / 6) * 1.5;
                const charJitterY = (getDeterminRandom(charSeed + '-jy') - 0.5) * 2 * baseJitterRange;

                // 2. Horizontal Spacing Noise (±1.5px max)
                const spacingNoiseRange = (jitter / 6) * 1.5;
                const charSpacingNoise = (getDeterminRandom(charSeed + '-sx') - 0.5) * 2 * spacingNoiseRange;

                // 3. Pressure variation (0.2 to 1.0)
                const pressureVar = (getDeterminRandom(charSeed + '-pv') - 0.5) * 0.4;
                const charPressure = Math.max(0.2, Math.min(1.0, 0.8 + pressureVar * pressure));

                // 4. Width measurement from PNG dimensions
                let charWidth = 0;
                const urls = sourceMap[char] || sourceMap[' '];
                let chosenVariantIndex = 0;

                if (urls && urls.length > 0) {
                    chosenVariantIndex = Math.floor(getDeterminRandom(charSeed + '-variant') * urls.length);
                    const imgKey = `${char}-${chosenVariantIndex}`;
                    const img = glyphImagesRef.current[imgKey];
                    if (img) {
                        const glyphHeight = fontSize * 1.15;
                        charWidth = Math.max(2, (img.width / img.height) * glyphHeight + letterSpacing);
                    } else {
                        // Fallback estimation using font size ratios
                        charWidth = Math.max(2, (fontSize * 0.4) + letterSpacing);
                    }
                } else {
                    charWidth = Math.max(2, (fontSize * 0.4) + letterSpacing);
                }

                charSpecs.push({
                    char,
                    charJitterY,
                    charSpacingNoise,
                    charPressure,
                    charWidth,
                    variantIndex: chosenVariantIndex
                });

                wordWidth += charWidth + charSpacingNoise;
            }

            totalLineWidth += wordWidth;
            return {
                word,
                wordWidth,
                wordRotation,
                charSpecs
            };
        });

        // Add spaces width to total line width
        if (words.length > 1) {
            totalLineWidth += (words.length - 1) * spaceWidth;
        }

        // --- CALCULATE ALIGNMENT ---
        let startX = marginLeft + indent * (fontSize * 0.4);
        let justifyExtraSpace = 0;

        if (!isHeader) {
            if (textAlign === 'center') {
                startX = marginLeft + (textWidthLimit - totalLineWidth) / 2 + indent * (fontSize * 0.4);
            } else if (textAlign === 'right') {
                startX = rightLimit - totalLineWidth;
            } else if (textAlign === 'justify' && words.length > 1 && totalLineWidth < textWidthLimit * 0.9) {
                justifyExtraSpace = (textWidthLimit - totalLineWidth) / (words.length - 1);
            }
        } else {
            startX = marginLeft + (textWidthLimit - totalLineWidth) / 2;
        }

        // --- DRAWING PASS: Character-by-character render loop ---
        let currentX = startX;
        let lineDriftY = 0; // Cumulative line drift

        layoutWords.forEach((wordLayout, wIdx) => {
            const wordSeed = `${lineSeedBase}-w-${wIdx}`;
            const lineBias = (getDeterminRandom(lineSeedBase + '-bias') - 0.5) * 0.15;

            ctx.save();
            ctx.translate(currentX, lineBaselineY);
            ctx.rotate(wordLayout.wordRotation);

            let localX = 0;

            wordLayout.charSpecs.forEach((charLayout, cIdx) => {
                const charSeed = `${wordSeed}-c-${cIdx}`;

                // Accumulate line drift across characters
                lineDriftY += (getDeterminRandom(charSeed + '-drift') - 0.5 + lineBias) * 0.7 * (1 + jitter * 0.2);

                // Auto-correct line drift back to 0 near the right margin
                const globalCharX = currentX + localX;
                const marginProgress = (globalCharX - marginLeft) / textWidthLimit;
                let correction = 1.0;
                if (marginProgress > 0.65) {
                    correction = Math.max(0, 1 - (marginProgress - 0.65) / 0.35);
                }
                const activeDriftY = lineDriftY * correction;

                const drawX = localX + charLayout.charSpacingNoise;
                const drawY = charLayout.charJitterY + activeDriftY;

                // Ink pressure styling
                ctx.save();
                ctx.globalAlpha = 1.0 - (1.0 - charLayout.charPressure) * 0.45; // opacity maps to pressure

                // Smudge filter
                if (smudge > 0) {
                    const blurAmt = getDeterminRandom(charSeed + '-blur') * smudge * 0.35;
                    ctx.filter = `blur(${blurAmt}px)`;
                }

                const variantIdx = charLayout.variantIndex || 0;
                const imgKey = `${charLayout.char}-${variantIdx}`;
                const hasCustomGlyph = sourceMap[charLayout.char] && glyphImagesRef.current[imgKey];

                if (hasCustomGlyph) {
                    const img = glyphImagesRef.current[imgKey];
                    const glyphHeight = fontSize * 1.15;
                    const glyphWidth = charLayout.charWidth;

                    // Tint glyph image to active ink color using offscreen canvas cache
                    const tintedCanvas = getTintedGlyph(imgKey, img, color);

                    // Draw image centered vertically relative to baseline
                    ctx.drawImage(
                        tintedCanvas,
                        drawX,
                        drawY - (glyphHeight * 0.82), // align baseline
                        glyphWidth,
                        glyphHeight
                    );
                }

                ctx.restore();

                // Advance locally inside the rotated word frame
                localX += charLayout.charWidth + charLayout.charSpacingNoise;
            });

            ctx.restore();

            // Advance globally (words separated by space + justify buffer)
            currentX += wordLayout.wordWidth + spaceWidth + justifyExtraSpace;
        });
    }

    // Sub-routine to overlay organic paper fibers / cardboard grain texture
    function drawPaperTextureOverlay(ctx: CanvasRenderingContext2D, material: PaperMaterial) {
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 256;
        texCanvas.height = 256;
        const texCtx = texCanvas.getContext('2d');
        if (!texCtx) return;

        // Generate noise grain pixels
        const imgData = texCtx.createImageData(256, 256);
        const data = imgData.data;

        let noiseIntensity = 10;
        let alpha = 20;

        if (material === 'aged') {
            noiseIntensity = 22;
            alpha = 42;
        } else if (material === 'white') {
            noiseIntensity = 6;
            alpha = 14;
        } else {
            noiseIntensity = 12;
            alpha = 24;
        }

        for (let i = 0; i < data.length; i += 4) {
            const val = Math.floor((Math.random() - 0.5) * noiseIntensity);
            data[i] = 128 + val;     // R
            data[i + 1] = 128 + val; // G
            data[i + 2] = 128 + val; // B
            data[i + 3] = alpha;     // Opacity
        }
        texCtx.putImageData(imgData, 0, 0);

        // Draw organic hair-like fibers on the paper texture
        texCtx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        texCtx.lineWidth = 0.45;
        const numFibers = material === 'aged' ? 18 : 8;
        for (let f = 0; f < numFibers; f++) {
            const fx = Math.random() * 256;
            const fy = Math.random() * 256;
            const flen = 6 + Math.random() * 12;
            const fangle = Math.random() * Math.PI * 2;

            texCtx.beginPath();
            texCtx.moveTo(fx, fy);
            texCtx.lineTo(fx + Math.cos(fangle) * flen, fy + Math.sin(fangle) * flen);
            texCtx.stroke();
        }

        // Apply using multiply composite operation to overlay grain on the paper and ink
        const pattern = ctx.createPattern(texCanvas, 'repeat');
        if (pattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, baseWidth, baseHeight);
            ctx.restore();
        }
    }

    return (
        <canvas 
            ref={canvasRef} 
            style={{ 
                width: baseWidth, 
                height: baseHeight,
                display: 'block'
            }} 
        />
    );
}
