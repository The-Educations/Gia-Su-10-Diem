import sharp from "sharp";
export async function processPhoto(data) {
  const source = sharp(data, {
      limitInputPixels: 16000000,
      failOn: "warning",
    }),
    meta = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1)
    throw new Error();
  return await source
    .rotate()
    .resize(640, 640, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
}
