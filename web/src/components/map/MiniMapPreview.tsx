"use client";

import { useEffect, useRef } from "react";
import type { LatLngExpression, Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  lat: number;
  lng: number;
  className?: string;
  zoom?: number;
};

/** Faqat ko‘rish: marker surilmaydi, xaritani siljitish mumkin. */
export function MiniMapPreview({ lat, lng, className = "", zoom = 14 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !wrapRef.current) return;
      const start: LatLngExpression = [lat, lng];
      const map = L.map(wrapRef.current, {
        center: start,
        zoom,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      const icon = L.divIcon({
        className: "ustacall-leaflet-pin-preview",
        html: '<div style="width:14px;height:14px;background:#a78bfa;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const m = L.marker(start, { draggable: false, icon }).addTo(map);
      mapRef.current = map;
      markerRef.current = m;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bir marta init
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const m = markerRef.current;
    const cur = m.getLatLng();
    if (Math.abs(cur.lat - lat) < 1e-8 && Math.abs(cur.lng - lng) < 1e-8) return;
    m.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom(), { animate: true });
  }, [lat, lng]);

  return (
    <div
      ref={wrapRef}
      className={`min-h-[132px] w-full rounded-xl overflow-hidden border border-white/15 bg-black/40 ${className}`}
    />
  );
}
