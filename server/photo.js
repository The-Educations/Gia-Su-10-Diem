import sharp from "sharp";
export async function processPhoto(data, gallery = false) {
  const source = sharp(data, {
      limitInputPixels: 16000000,
      failOn: "warning",
    }),
    meta = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1)
    throw new Error();
  return await source
    .rotate()
    .resize(gallery ? 1280 : 640, gallery ? 1280 : 640, {
      fit: gallery ? "inside" : "cover",
      withoutEnlargement: gallery,
    })
    .webp({ quality: 85 })
    .toBuffer();
}
