import { createHash } from "node:crypto";

// Public tutor maps use a stable offset rather than the tutor's real center.
// The offset is derived only from the tutor id, so repeat viewers see the same
// approximate area while the exact address never leaves the server.
export function blurredAreaCenter(tutorId, lat, lng) {
  const hash = createHash("sha256").update(`tutor-area:${tutorId}`).digest();
  const angle = (hash.readUInt16BE(0) / 65535) * Math.PI * 2;
  const distanceKm = 1.5 + (hash[2] / 255) * 0.5;
  const latDelta = (distanceKm * Math.cos(angle)) / 110.574;
  const lngDegreeKm = Math.max(18, 111.32 * Math.cos((lat * Math.PI) / 180));
  const lngDelta = (distanceKm * Math.sin(angle)) / lngDegreeKm;
  return {
    area_lat: Number((lat + latDelta).toFixed(6)),
    area_lng: Number((lng + lngDelta).toFixed(6)),
  };
}

export function publicAreaFields(tutor) {
  if (tutor.mode === "online" || tutor.area_lat == null || tutor.area_lng == null || tutor.area_km == null) return {};
  return {
    ...blurredAreaCenter(tutor.user_id, tutor.area_lat, tutor.area_lng),
    area_blurred: 1,
  };
}
