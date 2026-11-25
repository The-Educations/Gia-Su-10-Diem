import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Props = {
  lat: number;
  lng: number;
  km: number;
  exact?: boolean;
};

const zoomFor = (km: number) => (km <= 3 ? 12 : km <= 6 ? 11 : km <= 12 ? 10 : 9);

// Read-only public area map. The center it receives is already approximate for
// students; only the tutor's own studio preview passes the exact center.
export function TutorAreaView({ lat, lng, km, exact = false }: Props) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    let map: any;
    (async () => {
      try {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css" as any);
        if (dead || !host.current) return;
        const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#852f36";
        map = L.map(host.current, {
          attributionControl: true,
          zoomControl: true,
          scrollWheelZoom: false,
          dragging: false,
          touchZoom: true,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
        }).setView([lat, lng], zoomFor(km));
        map.attributionControl.setPrefix(false);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);
        L.circle([lat, lng], {
          radius: km * 1000,
          color: primary,
          weight: 2,
          fillColor: primary,
          fillOpacity: 0.13,
        }).addTo(map);
        L.circleMarker([lat, lng], {
          radius: 5,
          color: primary,
          weight: 2,
          fillColor: "#fffdfa",
          fillOpacity: 1,
        }).addTo(map);
        setTimeout(() => map?.invalidateSize(), 80);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; map?.remove(); };
  }, [lat, lng, km]);

  return (
    <figure className="tutor-area-map">
      <div ref={host} className="tutor-area-canvas" role="img" aria-label={t("Bản đồ khu vực dạy trực tiếp trong khoảng {km} km", { km })} />
      <figcaption>
        {exact
          ? t("Bản xem trước của riêng bạn hiển thị đúng tâm khu vực đã chọn.")
          : t("Vị trí hiển thị là khu vực ước lượng, không phải địa chỉ chính xác.")}
        {failed && ` ${t("Không tải được bản đồ, nhưng khu vực phục vụ vẫn trong khoảng {km} km.", { km })}`}
      </figcaption>
    </figure>
  );
}
