import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Simple CRC32 helper for PNG chunk validation
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Helper to create a chunk buffer (Length + Type + Data + CRC)
function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);

  const crcBuf = Buffer.alloc(4 + len);
  crcBuf.write(type, 0);
  data.copy(crcBuf, 4);

  buf.writeUInt32BE(crc32(crcBuf), 8 + len);
  return buf;
}

// Generate circular red tomato icon with 3D gradient shading and leaves
function generatePng(size) {
  const width = size;
  const height = size;

  const scanlineLength = 1 + width * 4;
  const buffer = Buffer.alloc(height * scanlineLength);

  const cx = width / 2;
  const cy = height * 0.55; // Slightly lower center to leave room for the green stem
  const rBodyX = size * 0.4;
  const rBodyY = size * 0.32; // Slightly squashed vertically (plump tomato)

  // Light source position for 3D shading
  const lx = cx - rBodyX * 0.35;
  const ly = cy - rBodyY * 0.45;

  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLength;
    buffer[offset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;

      const bodyDist = (dx * dx) / (rBodyX * rBodyX) + (dy * dy) / (rBodyY * rBodyY);

      let r = 0,
        g = 0,
        b = 0,
        a = 0;

      // 1. Draw Green Stem & Leaves
      const lx_c = cx;
      const ly_c = cy - rBodyY + size * 0.05;
      const leafDx = x - lx_c;
      const leafDy = y - ly_c;
      const dist = Math.sqrt(leafDx * leafDx + leafDy * leafDy);
      const angle = Math.atan2(leafDy, leafDx);

      let isLeaf = false;
      let leafShub = false; // Darker green shadow leaf

      if (dist < size * 0.28) {
        const normAngle = angle * (180 / Math.PI); // Range: -180 to 180

        // Leaf 1: pointing up (-90 deg)
        const d1 = Math.abs(normAngle - -90);
        const limit1 = size * 0.22 * Math.cos((d1 * Math.PI) / 90);
        if (d1 < 45 && dist < limit1) isLeaf = true;

        // Leaf 2: pointing left-up (-155 deg)
        const d2 = Math.abs(normAngle - -155);
        const limit2 = size * 0.2 * Math.cos((d2 * Math.PI) / 80);
        if (d2 < 40 && dist < limit2) isLeaf = true;

        // Leaf 3: pointing right-up (-25 deg)
        const d3 = Math.abs(normAngle - -25);
        const limit3 = size * 0.2 * Math.cos((d3 * Math.PI) / 80);
        if (d3 < 40 && dist < limit3) isLeaf = true;

        // Leaf 4: pointing left-down (-120 deg) - darker shadow
        const d4 = Math.abs(normAngle - -120);
        const limit4 = size * 0.16 * Math.cos((d4 * Math.PI) / 60);
        if (d4 < 30 && dist < limit4) {
          isLeaf = true;
          leafShub = true;
        }

        // Leaf 5: pointing right-down (-60 deg) - darker shadow
        const d5 = Math.abs(normAngle - -60);
        const limit5 = size * 0.16 * Math.cos((d5 * Math.PI) / 60);
        if (d5 < 30 && dist < limit5) {
          isLeaf = true;
          leafShub = true;
        }
      }

      // Vertical main stem
      if (Math.abs(leafDx) < size * 0.035 && leafDy < 0 && leafDy > -size * 0.16) {
        isLeaf = true;
      }

      if (isLeaf) {
        if (leafShub) {
          r = 5;
          g = 150;
          b = 105;
          a = 255; // #059669 (Darker Green)
        } else {
          r = 16;
          g = 185;
          b = 129;
          a = 255; // #10B981 (Vibrant Green)
        }
      }

      // 2. Draw Tomato Body (Red overrides stem where overlapping)
      if (bodyDist <= 1.0) {
        const ldx = x - lx;
        const ldy = y - ly;
        const distFromLight = Math.sqrt(ldx * ldx + ldy * ldy);
        const maxDist = size * 0.8;

        // 3D Sphere Shading
        const t = Math.min(1, distFromLight / maxDist);
        if (t < 0.3) {
          const factor = t / 0.3;
          r = Math.round(255 - (255 - 239) * factor);
          g = Math.round(107 - (107 - 68) * factor);
          b = Math.round(107 - (107 - 68) * factor);
        } else {
          const factor = (t - 0.3) / 0.7;
          r = Math.round(239 - (239 - 153) * factor);
          g = Math.round(68 - (68 - 27) * factor);
          b = Math.round(68 - (68 - 27) * factor);
        }
        a = 255;

        // Soft glossy white shine in the upper-left quadrant
        const shineDx = x - (cx - size * 0.13);
        const shineDy = y - (cy - size * 0.13);
        const shineDist = Math.sqrt(shineDx * shineDx + shineDy * shineDy);
        const shineRadius = size * 0.08;
        if (shineDist <= shineRadius) {
          const shineIntensity = 1 - shineDist / shineRadius;
          r = Math.round(r + (255 - r) * shineIntensity * 0.65);
          g = Math.round(g + (255 - g) * shineIntensity * 0.65);
          b = Math.round(b + (255 - b) * shineIntensity * 0.65);
        }
      }

      buffer[pxOffset] = r;
      buffer[pxOffset + 1] = g;
      buffer[pxOffset + 2] = b;
      buffer[pxOffset + 3] = a;
    }
  }

  // PNG Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const compressed = zlib.deflateSync(buffer);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const iconsDir = path.join(process.cwd(), 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const pngBuf = generatePng(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), pngBuf);
  console.log(`Generated red tomato icon: icon-${size}.png (${pngBuf.length} bytes)`);
});
