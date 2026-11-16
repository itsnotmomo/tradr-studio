// Checks that the QR code on a rendered slide scans: npx tsx scripts/news/qrcheck.mts <slide.jpg>
import sharp from "sharp"; import jsQR from "jsqr";
for (const w of [1080, 540, 400]) {
  const { data, info } = await sharp(process.argv[2]).resize(w).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  console.log(w, r?.data ?? "NO DECODE");
}
