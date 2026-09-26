"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type MemoryType = "message" | "photo" | "song" | "link";

type StarMemory = {
  id: string;
  claimant: string;
  type: MemoryType;
  text?: string;
  link?: string;
  name?: string;
  createdAt: number;
};

type ClaimStatus = "pending_verification" | "verified";

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
  history?: StarMemory[];
  availableAt?: number;
  claimStatus?: ClaimStatus;
  verificationExpiresAt?: number;
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
  const [encounterMode, setEncounterMode] = useState(false);
  const [claimStarted, setClaimStarted] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("streetstars:stars");
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as Star[];
      setStars(stored.map((star) => {
        if (star.history) return star;
        if (!star.memory && !star.claimant) return { ...star, history: [] };
        return {
          ...star,
          claimStatus: star.status === "claimed" ? "verified" : star.claimStatus,
          history: [{
            id: `legacy-${star.id}`,
            claimant: star.claimant || "UNKNOWN",
            type: star.memoryType || "message",
            text: star.memory,
            link: star.memoryLink,
            name: star.memoryName,
            createdAt: Date.now(),
          }],
        };
      }));
    } catch {
      localStorage.removeItem("streetstars:stars");
    }
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
    const expirePendingClaims = () => {
      const now = Date.now();
      setStars((prev) => {
        let changed = false;
        const next = prev.map((star) => {
          if (
            star.status === "claimed" &&
            star.claimStatus === "pending_verification" &&
            star.verificationExpiresAt &&
            now >= star.verificationExpiresAt
          ) {
            changed = true;
            return {
              ...star,
              status: "available" as const,
              claimant: undefined,
              memory: undefined,
              memoryType: undefined,
              memoryLink: undefined,
              memoryName: undefined,
              claimStatus: undefined,
              verificationExpiresAt: undefined,
            };
          }
          return star;
        });
        return changed ? next : prev;
      });
    };

    expirePendingClaims();
    const interval = window.setInterval(expirePendingClaims, 1000);
    return () => window.clearInterval(interval);
  }, []);

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
        setEncounterMode(true);
        setClaimStarted(false);
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

  const startClaim = () => {
    if (!selected || !found) return;
    setClaimStarted(true);
    setMessage("");
  };

  const claim = () => {
    if (!selected || !found || !name.trim()) return;
    const next = {
      ...selected,
      status: "claimed" as const,
      claimant: name.trim(),
      claimStatus: "pending_verification" as const,
      verificationExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
      memory: undefined,
      memoryType: undefined,
      memoryLink: undefined,
      memoryName: undefined,
    };
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
    const nextMemory: StarMemory = {
      id: `${selected.id}-${Date.now()}`,
      claimant: name.trim(),
      type: memoryType,
      text: memory.trim() || undefined,
      link: memoryLink.trim() || undefined,
      name: memoryFile || undefined,
      createdAt: Date.now(),
    };
    const next = {
      ...selected,
      history: [...(selected.history || []), nextMemory],
      memory: memory.trim() || memoryFile || memoryLink.trim(),
      memoryType,
      memoryLink: memoryLink.trim() || undefined,
      memoryName: memoryFile || undefined,
    };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setLeaveMode(false);
    setMessage("MEMORY LEFT. VERIFY YOUR CLAIM WITHIN 24 HOURS.");
  };

  const handlePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setMemoryFile(file.name);
  };

  const verifyClaim = () => {
    if (!selected || selected.claimStatus !== "pending_verification") return;
    const next = {
      ...selected,
      claimStatus: "verified" as const,
      verificationExpiresAt: undefined,
    };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setMessage("CLAIM VERIFIED. THIS MEMORY IS NOW PART OF THE STAR'S HISTORY.");
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
      claimStatus: undefined,
      verificationExpiresAt: undefined,
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

      {selected && !claimMoment && (
        <aside className={"star-card glass " + (leaveMode ? "leave-card" : "") + (encounterMode ? "encounter-card" : "")}>
          <button className="close" onClick={() => { setSelected(null); setLeaveMode(false); setEncounterMode(false); setClaimStarted(false); }} aria-label="Close">×</button>
          {leaveMode ? (
            <div className="leave-memory">
              <span className="eyebrow">STAR CLAIMED · {selected.street.toUpperCase()}</span>
              <div className="leave-title"><span className="leave-star">★</span><h2>LEAVE<br /><em>SOMETHING.</em></h2></div>
              <p className="leave-intro">This moment belongs to you. Leave something for the next person who finds this star.</p>
              <div className="memory-options">
                {[
                  { type: "message" as MemoryType, label: "MESSAGE", hint: "Leave a few words.", icon: "Aa" },
                  { type: "photo" as MemoryType, label: "PHOTO", hint: "Leave a moment.", icon: "◫" },
                  { type: "song" as MemoryType, label: "SONG", hint: "Leave something to hear.", icon: "♫" },
                  { type: "link" as MemoryType, label: "LINK", hint: "Leave something to explore.", icon: "↗" },
                ].map((option) => (
                  <button key={option.type} className={"memory-option " + (memoryType === option.type ? "active" : "")} onClick={() => setMemoryType(option.type)}>
                    <span className="memory-icon">{option.icon}</span><span><strong>{option.label}</strong><small>{option.hint}</small></span>
                  </button>
                ))}
              </div>
              {memoryType === "photo" ? (
                <label className="memory-upload"><input type="file" accept="image/*" onChange={handlePhoto} /><span className="upload-mark">+</span><strong>{memoryFile || "CHOOSE A PHOTO"}</strong><small>{memoryFile ? "READY TO LEAVE ON THIS STAR." : "A PHOTO FROM YOUR CAMERA ROLL."}</small></label>
              ) : memoryType === "song" ? (
                <div className="memory-editor"><input value={memoryLink} onChange={(e) => setMemoryLink(e.target.value)} placeholder="Song or streaming link" /><input value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="Song title or a few words" /></div>
              ) : memoryType === "link" ? (
                <div className="memory-editor"><input value={memoryLink} onChange={(e) => setMemoryLink(e.target.value)} placeholder="Paste a link" /><input value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="What are you leaving?" /></div>
              ) : (
                <div className="memory-editor"><textarea value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="What would you like to leave here?" rows={4} autoFocus /></div>
              )}
              <button className="locate-button wide leave-submit" onClick={saveMemory}>LEAVE IT HERE <span>→</span></button>
              <button className="skip-memory" onClick={() => { setLeaveMode(false); setMessage("YOU CAN LEAVE SOMETHING HERE ANY TIME."); }}>NOT NOW</button>
            </div>
          ) : (
            <>
              <span className="eyebrow">{selected.status.toUpperCase()}</span>
              <div className="star-card-title"><span>★</span><h2>{selected.id}</h2></div>
              <p className="street-name">{selected.street}<br />Berlin</p>
              {selected.status === "resting" ? (
                <>
                  <div className="resting-copy">This Star is resting.<br />It will return without warning.</div>
                  {selected.history && selected.history.length > 0 && (
                    <div className="star-history">
                      <span className="history-heading">{selected.history.length} {selected.history.length === 1 ? "MEMORY" : "MEMORIES"} LEFT HERE</span>
                      {[...selected.history].reverse().map((entry) => (
                        <div className="history-entry" key={entry.id}>
                          <div className="history-meta"><strong>{entry.claimant.toUpperCase()}</strong><span>{new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
                          {entry.text && <p>{entry.type === "message" ? "“" + entry.text + "”" : entry.text}</p>}
                          {entry.name && <p>◫ {entry.name}</p>}
                          {entry.link && <p>↗ {entry.link}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : selected.status === "claimed" ? (
                <>
                  <div className={"claim-status " + (selected.claimStatus === "pending_verification" ? "pending" : "verified")}>
                    <span className="claim-status-label">
                      {selected.claimStatus === "pending_verification" ? "CLAIMED · VERIFYING" : "CLAIM VERIFIED"}
                    </span>
                    {selected.claimStatus === "pending_verification" && selected.verificationExpiresAt && (
                      <span className="verification-countdown">
                        {(() => {
                          const remaining = Math.max(0, selected.verificationExpiresAt - Date.now());
                          const hours = Math.floor(remaining / 3600000);
                          const minutes = Math.floor((remaining % 3600000) / 60000);
                          return hours + "H " + minutes.toString().padStart(2, "0") + "M REMAINING";
                        })()}
                      </span>
                    )}
                  </div>

                  {selected.claimStatus === "pending_verification" && (
                    <div className="verification-panel">
                      <strong>Keep your Star memory</strong>
                      <p>We’ve sent a link to verify your claim.</p>
                      <small>This prototype simulates the magic-link step. Verification must happen within 24 hours.</small>
                      <button className="locate-button wide verify-button" onClick={verifyClaim}>VERIFY CLAIM <span>→</span></button>
                    </div>
                  )}

                  <div className="memory-copy">
                    <span>LEFT BY {selected.claimant?.toUpperCase()}</span>
                    {selected.memory && <p>{selected.memoryType === "message" ? "“" + selected.memory + "”" : selected.memory}</p>}
                    {selected.memoryName && <p>◫ {selected.memoryName}</p>}
                    {selected.memoryLink && <p>↗ {selected.memoryLink}</p>}
                  </div>
                  <button className="text-button" onClick={() => setLeaveMode(true)}>LEAVE SOMETHING ELSE →</button>
                  {selected.claimStatus === "verified" && <button className="text-button" onClick={release}>RELEASE STAR →</button>}
                </>
              ) : (
                <>
                  {!position && <button className="locate-button wide" onClick={locate}>GO FIND IT →</button>}
                  {position && (
                    <>
                      <div className={"distance-readout " + (found ? "found" : "")}><strong>{distance}m</strong><span>{found ? "YOU FOUND IT." : "WALK TO THIS STAR"}</span></div>
                      {found && <div className="claim-form"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /><button className="locate-button wide claim-button" onClick={claim} disabled={!name.trim()}>CLAIM THIS STAR <span>★</span></button></div>}
                    </>
                  )}
                </>
              )}
              {message && <div className="message">{message}</div>}
            </>
          )}
        </aside>
      )}

      {claimMoment && selected && (
        <div className="claim-moment" role="dialog" aria-live="polite" aria-label="Star claimed">
          <div className="claim-moment-backdrop" />
          <div className="claim-particles" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
          <div className="claim-glints" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="claim-moment-content">
            <div className="claim-moment-star" aria-hidden="true"><span className="star-glyph">★</span><span className="star-rays" /></div>
            <span className="eyebrow">STREET STARS · BERLIN</span>
            <div className="claim-kicker">THE STAR IS YOURS</div>
            <h2>{selected.street}</h2>
            <p>STAR {selected.id} · CLAIMED BY {selected.claimant?.toUpperCase()}</p>
          </div>
        </div>
      )}
    </main>
  );
}
