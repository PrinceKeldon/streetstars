"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";

type Star = {
  id: string;
  street: string;
  lat: number;
  lon: number;
  status: "available" | "claimed" | "resting";
  claimant?: string;
  memory?: string;
  availableAt?: number;
};

const BERLIN = { lat: 52.52, lon: 13.405 };

const SEED: Star[] = [
  { id: "BERLIN-001", street: "Oranienstraße", lat: 52.499, lon: 13.423, status: "available" },
  { id: "BERLIN-002", street: "Weserstraße", lat: 52.545, lon: 13.424, status: "available" },
  { id: "BERLIN-003", street: "Kastanienallee", lat: 52.538, lon: 13.411, status: "available" },
  { id: "BERLIN-004", street: "Karl-Marx-Allee", lat: 52.518, lon: 13.447, status: "available" },
  { id: "BERLIN-005", street: "Reichenberger Straße", lat: 52.495, lon: 13.431, status: "available" },
  { id: "BERLIN-006", street: "Warschauer Straße", lat: 52.506, lon: 13.451, status: "available" },
];

function distanceMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function StarMarker({ star, onClick }: { star: Star; onClick: () => void }) {
  return (
    <button className={`map-star-marker ${star.status}`} onClick={onClick} aria-label={star.id}>
      <span className="star-halo" aria-hidden="true" />
      <span className="star-glyph" aria-hidden="true">★</span>
      <span className="star-pulse" aria-hidden="true" />
    </button>
  );
}

export default function Home() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [stars, setStars] = useState(SEED);
  const [selected, setSelected] = useState<Star | null>(null);
  const [position, setPosition] = useState<typeof BERLIN | null>(null);
  const [name, setName] = useState("");
  const [memory, setMemory] = useState("");
  const [message, setMessage] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [claimMoment, setClaimMoment] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("streetstars:stars");
    if (raw) setStars(JSON.parse(raw));
  }, []);

  useEffect(() => {
    localStorage.setItem("streetstars:stars", JSON.stringify(stars));
  }, [stars]);

  const visibleStars = useMemo(() => stars.map((s) =>
    s.availableAt && s.availableAt <= Date.now()
      ? { ...s, status: "available" as const, availableAt: undefined }
      : s
  ), [stars]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container: mapNode.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [BERLIN.lon, BERLIN.lat],
      zoom: 12.8,
      pitch: 48,
      bearing: -8,
      maxPitch: 65,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");

    map.on("load", () => {
      map.addSource("streetstars-buildings", {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      });

      const labelLayer = map.getStyle().layers?.find(
        (layer) => layer.type === "symbol" && layer.layout?.["text-field"]
      )?.id;

      map.addLayer({
        id: "streetstars-3d-buildings",
        source: "streetstars-buildings",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 13,
        filter: ["!=", ["get", "hide_3d"], true],
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["get", "render_height"],
            0, "#d8d4ca",
            35, "#c8c2b7",
            100, "#aaa398",
          ],
          "fill-extrusion-opacity": 0.82,
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"], 14, 0, 15, ["get", "render_height"]
          ],
          "fill-extrusion-base": ["get", "render_min_height"],
        },
      }, labelLayer);

      mapRef.current = map;
      setMapReady(true);
      map.resize();
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      userMarkerRef.current?.remove();
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = visibleStars.map((star) => {
      const element = document.createElement("div");
      const button = document.createElement("button");
      button.className = `map-star-marker ${star.status}`;
      button.setAttribute("aria-label", `${star.id} · ${star.street}`);
      button.innerHTML = `
        <span class="star-halo" aria-hidden="true"></span>
        <span class="star-glyph" aria-hidden="true">★</span>
        <span class="star-pulse" aria-hidden="true"></span>
      `;
      button.onclick = () => {
        setSelected(star);
        setMessage("");
        map.flyTo({ center: [star.lon, star.lat], zoom: Math.max(map.getZoom(), 14.7), pitch: 52, duration: 900 });
      };
      element.appendChild(button);
      return new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([star.lon, star.lat])
        .addTo(map);
    });

    if (position) {
      const element = document.createElement("div");
      element.className = "you-are-here";
      userMarkerRef.current?.remove();
      userMarkerRef.current = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([position.lon, position.lat])
        .addTo(map);
    }
  }, [visibleStars, position, mapReady]);

  const locate = () => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPosition(next);
        setLocating(false);
        mapRef.current?.flyTo({ center: [next.lon, next.lat], zoom: 15, pitch: 52, duration: 1200 });

        if (watchIdRef.current === null) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (watch) => setPosition({ lat: watch.coords.latitude, lon: watch.coords.longitude }),
            () => setMessage("LIVE LOCATION UPDATE LOST."),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
          );
        }
      },
      () => {
        setLocating(false);
        setMessage("LOCATION COULD NOT BE FOUND.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  const distance = selected && position ? Math.round(distanceMetres(position, selected)) : null;
  const found = distance !== null && distance <= 75;

  const claim = () => {
    if (!selected || !found || !name.trim()) return;
    const next = { ...selected, status: "claimed" as const, claimant: name.trim(), memory: memory.trim() };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setMessage("YOU FOUND IT.");
    setClaimMoment(true);
    window.setTimeout(() => setClaimMoment(false), 4200);
  };

  const release = () => {
    if (!selected) return;
    const delay = (6 + Math.floor(Math.random() * 67)) * 60 * 60 * 1000;
    const next = {
      ...selected,
      status: "resting" as const,
      claimant: undefined,
      memory: undefined,
      availableAt: Date.now() + delay,
    };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setMessage("RELEASED. THE STAR WILL RETURN WITHOUT WARNING.");
  };

  return (
    <main className="street-stars">
      <div ref={mapNode} className="map-canvas" aria-label="Interactive Berlin Street Stars map" />

      <button
        className={`my-location-button ${position ? "located" : ""} ${locating ? "locating" : ""}`}
        onClick={locate}
        disabled={locating}
        aria-label={locating ? "Finding your location" : "Show my location"}
      >
        <span className="location-crosshair" aria-hidden="true"><i /></span>
        <span>{locating ? "LOCATING" : position ? "MY LOCATION" : "MY LOCATION"}</span>
      </button>

      {selected && (
        <aside className="star-card glass">
          <button className="close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <span className="eyebrow">{selected.status.toUpperCase()}</span>
          <div className="star-card-title"><span>★</span><h2>{selected.id}</h2></div>
          <p className="street-name">{selected.street}<br />Berlin</p>
          {selected.status === "resting" ? (
            <div className="resting-copy">This Star is resting.<br />It will return without warning.</div>
          ) : selected.status === "claimed" ? (
            <>
              <div className="memory-copy"><span>LEFT BY {selected.claimant?.toUpperCase()}</span>{selected.memory && <p>“{selected.memory}”</p>}</div>
              <button className="text-button" onClick={release}>RELEASE STAR →</button>
            </>
          ) : (
            <>
              {!position && <button className="locate-button wide" onClick={locate}>GO FIND IT →</button>}
              {position && (
                <>
                  <div className={`distance-readout ${found ? "found" : ""}`}><strong>{distance}m</strong><span>{found ? "YOU FOUND IT." : "WALK TO THIS STAR"}</span></div>
                  {found && <div className="claim-form"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /><textarea value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="What would you like to leave here?" rows={3} /><button className="locate-button wide" onClick={claim}>CLAIM & LEAVE →</button></div>}
                </>
              )}
            </>
          )}
          {message && <div className="message">{message}</div>}
        </aside>
      )}

      {claimMoment && selected && (
        <div className="claim-moment" role="dialog" aria-live="polite" aria-label="Star claimed">
          <div className="claim-moment-backdrop" />
          <div className="claim-moment-content">
            <div className="claim-moment-star" aria-hidden="true">
              <span className="star-glyph">★</span>
              <span className="star-rays" />
            </div>
            <span className="eyebrow">STREET STARS · BERLIN</span>
            <div className="claim-kicker">THE STAR IS YOURS</div>
            <h2>{selected.street}</h2>
            <p>STAR {selected.id} · LEFT BY {selected.claimant?.toUpperCase()}</p>
            {selected.memory && <blockquote>“{selected.memory}”</blockquote>}
            <div className="claim-rule" />
            <span className="claim-foot">A MEMORY HAS BEEN LEFT ON THIS STREET.</span>
          </div>
        </div>
      )}

    </main>
  );
}
