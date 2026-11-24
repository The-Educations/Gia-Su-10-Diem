import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

type LatLng = { lat: number; lng: number };
type Value = { area_lat?: number | null; area_lng?: number | null; area_km?: number | null };
type Props = { value: Value; onChange: (next: Value) => void };

// Vietnam-wide default view until the tutor picks a center.
const DEFAULT_VIEW: LatLng = { lat: 16.0, lng: 106.0 };
const DEFAULT_ZOOM = 5;

// Offline tutoring area picker: a draggable marker inside a radius circle the
// tutor sizes between 1 and 30 km. Leaflet + OSM tiles load lazily so the map
// never inflates the main bundle.
export function AreaMap({ value, onChange }: Props) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [km, setKm] = useState(value.area_km ?? 5);
  const [center, setCenter] = useState<LatLng>({
    lat: value.area_lat ?? DEFAULT_VIEW.lat,
    lng: value.area_lng ?? DEFAULT_VIEW.lng,
  });

  useEffect(() => {
    let dead = false;
    let map: any;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css" as any);
      if (dead || !host.current || mapRef.current) return;
      map = L.map(host.current, { attributionControl: true }).setView(
        [center.lat, center.lng],
        value.area_lat != null ? 11 : DEFAULT_ZOOM,
      );
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([center.lat, center.lng], { draggable: true }).addTo(map);
      const circle = L.circle([center.lat, center.lng], { radius: km * 1000, color: "#852f36", weight: 2, fillOpacity: 0.12 }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        circle.setLatLng(p);
        setCenter({ lat: p.lat, lng: p.lng });
        onChange({ area_lat: p.lat, area_lng: p.lng, area_km: km });
      });
      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        setCenter({ lat: e.latlng.lat, lng: e.latlng.lng });
        onChange({ area_lat: e.latlng.lat, area_lng: e.latlng.lng, area_km: km });
      });
      mapRef.current = map;
      circleRef.current = circle;
      markerRef.current = marker;
    })();
    return () => { dead = true; map?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resize = (nextKm: number) => {
    setKm(nextKm);
    circleRef.current?.setRadius(nextKm * 1000);
    onChange({ area_lat: center.lat, area_lng: center.lng, area_km: nextKm });
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      markerRef.current?.setLatLng(latlng);
      circleRef.current?.setLatLng(latlng);
      mapRef.current?.setView(latlng, 13);
      setCenter(latlng);
      onChange({ area_lat: latlng.lat, area_lng: latlng.lng, area_km: km });
    });
  };

  return (
    <div className="area-map">
      <div ref={host} className="area-map-canvas" role="application" aria-label={t("Bản đồ khu vực dạy")} />
      <div className="area-map-controls">
        <label className="area-km">
          {t("Bán kính")}: <strong data-testid="area-km-value">{km} km</strong>
          <input type="range" min={1} max={30} step={1} value={km} onChange={(e) => resize(Number(e.target.value))} aria-label={t("Bán kính khu vực dạy")} />
        </label>
        <button type="button" className="chip" onClick={locate}>{t("Dùng vị trí của tôi")}</button>
      </div>
      <p className="field-hint">{t("Kéo điểm đến nơi bạn nhận dạy trực tiếp, chọn bán kính khu vực phục vụ.")}</p>
    </div>
  );
}
