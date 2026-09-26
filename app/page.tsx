"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type MemoryType = "message" | "photo" | "song" | "link";

type Star = {
  id: string;
  street: string;
  lat: number;
  lon: number;
  status: "available" | "claimed" | "resting";
  claimant?: string;
  memory?: string;
  memoryType?: MemoryType;
  memoryLink?: string;
  memoryName?: string;
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
  const [memoryType, setMemoryType] = useState<MemoryType>("message");
  const [memoryLink, setMemoryLink] = useState("");
  const [memoryFile, setMemoryFile] = useState("");
  const [message, setMessage] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [claimMoment, setClaimMoment] = useState(false);
  const [leaveMode, setLeaveMode] = useState(false);
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
    const next = { ...selected, status: "claimed" as const, claimant: name.trim() };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setMessage("");
    setClaimMoment(true);
    window.setTimeout(() => {
      setClaimMoment(false);
      setLeaveMode(true);
    }, 2850);
  };

  const saveMemory = () => {
    if (!selected || !name.trim()) return;
    const next = {
      ...selected,
      memory: memory.trim() || memoryFile || memoryLink.trim(),
      memoryType,
      memoryLink: memoryLink.trim() || undefined,
      memoryName: memoryFile || undefined,
    };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setLeaveMode(false);
    setMessage("MEMORY LEFT. THIS STAR WILL CARRY IT FORWARD.");
  };

  const handlePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setMemoryFile(file.name);
  };

  const release = () => {
    if (!selected) return;
    const delay = (6 + Math.floor(Math.random() * 67)) * 60 * 60 * 1000;
    const next = {
      ...selected,
      status: "resting" as const,
      claimant: undefined,
      memory: undefined,
      memoryType: undefined,
      memoryLink: undefined,
      memoryName: undefined,
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

      {selected && !claimMoment && (\n        <aside className={"star-card glass " + (leaveMode ? "leave-card" : "")}>\n          <button className="close" onClick={() => { setSelected(null); setLeaveMode(false); }} aria-label="Close">×</button>\n          {leaveMode ? (\n            <div className="leave-memory">\n              <span className="eyebrow">STAR CLAIMED · {selected.street.toUpperCase()}</span>\n              <div className="leave-title"><span className="leave-star">★</span><h2>LEAVE<br /><em>SOMETHING.</em></h2></div>\n              <p className="leave-intro">This moment belongs to you. Leave something for the next person who finds this star.</p>\n              <div className="memory-options">\n                {[\n                  { type: "message" as MemoryType, label: "MESSAGE", hint: "Leave a few words.", icon: "Aa" },\n                  { type: "photo" as MemoryType, label: "PHOTO", hint: "Leave a moment.", icon: "◫" },\n                  { type: "song" as MemoryType, label: "SONG", hint: "Leave something to hear.", icon: "♫" },\n                  { type: "link" as MemoryType, label: "LINK", hint: "Leave something to explore.", icon: "↗" },\n                ].map((option) => (\n                  <button key={option.type} className={"memory-option " + (memoryType === option.type ? "active" : "")} onClick={() => setMemoryType(option.type)}>\n                    <span className="memory-icon">{option.icon}</span><span><strong>{option.label}</strong><small>{option.hint}</small></span>\n                  </button>\n                ))}\n              </div>\n              {memoryType === "photo" ? (\n                <label className="memory-upload"><input type="file" accept="image/*" onChange={handlePhoto} /><span className="upload-mark">+</span><strong>{memoryFile || "CHOOSE A PHOTO"}</strong><small>{memoryFile ? "READY TO LEAVE ON THIS STAR." : "A PHOTO FROM YOUR CAMERA ROLL."}</small></label>\n              ) : memoryType === "song" ? (\n                <div className="memory-editor"><input value={memoryLink} onChange={(e) => setMemoryLink(e.target.value)} placeholder="Song or streaming link" /><input value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="Song title or a few words" /></div>\n              ) : memoryType === "link" ? (\n                <div className="memory-editor"><input value={memoryLink} onChange={(e) => setMemoryLink(e.target.value)} placeholder="Paste a link" /><input value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="What are you leaving?" /></div>\n              ) : (\n                <div className="memory-editor"><textarea value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="What would you like to leave here?" rows={4} autoFocus /></div>\n              )}\n              <button className="locate-button wide leave-submit" onClick={saveMemory}>LEAVE IT HERE <span>→</span></button>\n              <button className="skip-memory" onClick={() => { setLeaveMode(false); setMessage("YOU CAN LEAVE SOMETHING HERE ANY TIME."); }}>NOT NOW</button>\n            </div>\n          ) : (\n            <>\n              <span className="eyebrow">{selected.status.toUpperCase()}</span>\n              <div className="star-card-title"><span>★</span><h2>{selected.id}</h2></div>\n              <p className="street-name">{selected.street}<br />Berlin</p>\n              {selected.status === "resting" ? (\n                <div className="resting-copy">This Star is resting.<br />It will return without warning.</div>\n              ) : selected.status === "claimed" ? (\n                <>\n                  <div className="memory-copy"><span>LEFT BY {selected.claimant?.toUpperCase()}</span>{selected.memory && <p>{selected.memoryType === "message" ? "“" + selected.memory + "”" : selected.memory}</p>}{selected.memoryName && <p>◫ {selected.memoryName}</p>}{selected.memoryLink && <p>↗ {selected.memoryLink}</p>}</div>\n                  <button className="text-button" onClick={() => setLeaveMode(true)}>LEAVE SOMETHING ELSE →</button>\n                  <button className="text-button" onClick={release}>RELEASE STAR →</button>\n                </>\n              ) : (\n                <>\n                  {!position && <button className="locate-button wide" onClick={locate}>GO FIND IT →</button>}\n                  {position && (\n                    <>\n                      <div className={"distance-readout " + (found ? "found" : "")}><strong>{distance}m</strong><span>{found ? "YOU FOUND IT." : "WALK TO THIS STAR"}</span></div>\n                      {found && <div className="claim-form"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /><button className="locate-button wide claim-button" onClick={claim} disabled={!name.trim()}>CLAIM THIS STAR <span>★</span></button></div>}\n                    </>\n                  )}\n                </>\n              )}\n              {message && <div className="message">{message}</div>}\n            </>\n          )}\n        </aside>\n      )}\n\n      {claimMoment && selected && (\n        <div className="claim-moment" role="dialog" aria-live="polite" aria-label="Star claimed">\n          <div className="claim-moment-backdrop" />\n          <div className="claim-particles" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>\n          <div className="claim-glints" aria-hidden="true"><i /><i /><i /><i /></div>\n          <div className="claim-moment-content">\n            <div className="claim-moment-star" aria-hidden="true"><span className="star-glyph">★</span><span className="star-rays" /></div>\n            <span className="eyebrow">STREET STARS · BERLIN</span>\n            <div className="claim-kicker">THE STAR IS YOURS</div>\n            <h2>{selected.street}</h2>\n            <p>STAR {selected.id} · CLAIMED BY {selected.claimant?.toUpperCase()}</p>\n          </div>\n        </div>\n      )}\n    </main>\n  );\n}\n