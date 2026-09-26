"use client";

import { useEffect, useMemo, useState } from "react";

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

const BERLIN = { lat: 52.5200, lon: 13.4050 };

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

function project(lat: number, lon: number) {
  const left = 13.27;
  const right = 13.53;
  const top = 52.60;
  const bottom = 52.43;
  return {
    x: ((lon - left) / (right - left)) * 100,
    y: ((top - lat) / (top - bottom)) * 100,
  };
}

export default function Home() {
  const [stars, setStars] = useState(SEED);
  const [selected, setSelected] = useState<Star | null>(null);
  const [position, setPosition] = useState<typeof BERLIN | null>(null);
  const [name, setName] = useState("");
  const [memory, setMemory] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("streetstars:stars");
    if (raw) setStars(JSON.parse(raw));
  }, []);

  useEffect(() => {
    localStorage.setItem("streetstars:stars", JSON.stringify(stars));
  }, [stars]);

  const visibleStars = useMemo(
    () => stars.map((s) => s.availableAt && s.availableAt <= Date.now()
      ? { ...s, status: "available" as const, availableAt: undefined }
      : s),
    [stars]
  );

  const distance = selected && position ? Math.round(distanceMetres(position, selected)) : null;
  const found = distance !== null && distance <= 75;

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPosition({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setPosition(BERLIN)
    );
  };

  const claim = () => {
    if (!selected || !found || !name.trim()) return;
    const next = {
      ...selected,
      status: "claimed" as const,
      claimant: name.trim(),
      memory: memory.trim(),
    };
    setStars((prev) => prev.map((s) => s.id === selected.id ? next : s));
    setSelected(next);
    setMessage("YOU FOUND IT.");
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
      <div className="map-canvas" aria-label="Berlin Street Stars map">
        <svg className="berlin-map" viewBox="0 0 1000 680" preserveAspectRatio="none" role="img">
          <rect width="1000" height="680" className="map-ground" />
          <path className="spree" d="M0 205 C130 250 190 175 305 235 S470 315 560 260 S700 175 820 235 S940 315 1000 270" />
          <path className="spree" d="M0 430 C130 385 210 470 335 425 S515 370 650 430 S820 505 1000 440" />
          <ellipse className="ringbahn" cx="500" cy="340" rx="365" ry="245" />
          <g className="minor-roads">
            <path d="M70 70 L310 610" /><path d="M160 20 L500 650" /><path d="M260 0 L650 680" />
            <path d="M420 0 L780 680" /><path d="M575 0 L930 680" /><path d="M720 10 L990 560" />
            <path d="M30 160 L960 610" /><path d="M10 280 L990 180" /><path d="M40 500 L970 300" />
            <path d="M90 600 L920 90" /><path d="M190 680 L850 30" />
          </g>
          <g className="major-roads">
            <path d="M95 545 L350 300 L480 95" />
            <path d="M315 640 L505 390 L690 55" />
            <path d="M40 355 L310 355 L520 350 L920 355" />
            <path d="M170 150 L400 275 L650 285 L900 170" />
            <path d="M490 665 L500 390 L505 20" />
          </g>
          <g className="map-labels">
            <text x="210" y="170">CHARLOTTENBURG</text>
            <text x="420" y="115">MITTE</text>
            <text x="610" y="170">PRENZLAUER BERG</text>
            <text x="690" y="315">FRIEDRICHSHAIN</text>
            <text x="570" y="500">KREUZBERG</text>
            <text x="780" y="520">NEUKÖLLN</text>
            <text x="330" y="500">TEMPELHOF</text>
            <text x="505" y="285">Mitte</text>
            <text x="835" y="355">Spree</text>
          </g>
        </svg>

        <div className="map-grid" />

        {visibleStars.map((star) => {
          const p = project(star.lat, star.lon);
          return (
            <button
              key={star.id}
              className={"star-marker " + star.status}
              style={{ left: p.x + "%", top: p.y + "%" }}
              onClick={() => {
                setSelected(star);
                setMessage("");
              }}
              aria-label={star.id}
            >
              <span>★</span>
            </button>
          );
        })}

        {position && (
          <div
            className="you-are-here"
            style={{
              left: project(position.lat, position.lon).x + "%",
              top: project(position.lat, position.lon).y + "%",
            }}
          >
            <span />
          </div>
        )}
      </div>

      <header className="topbar glass">
        <div className="brand-mark">
          <span className="brand-star">★</span>
          <span>STREET STARS</span>
        </div>
        <div className="topbar-right">
          <span>BERLIN</span>
          <span className="edition-pill">EDITION I · 2026–2030</span>
        </div>
      </header>

      {!selected && (
        <section className="welcome glass">
          <span className="eyebrow">BERLIN · STREET STARS</span>
          <h1>Give the streets<br /><em>a memory.</em></h1>
          <p>Walk the city. Find a Star. Leave something behind.</p>
          <div className="how">
            <span><b>01</b> FIND</span>
            <span><b>02</b> WALK</span>
            <span><b>03</b> LEAVE</span>
          </div>
          <button className="locate-button" onClick={locate}>LOCATE ME <span>→</span></button>
        </section>
      )}

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
              <div className="memory-copy">
                <span>LEFT BY {selected.claimant?.toUpperCase()}</span>
                {selected.memory && <p>“{selected.memory}”</p>}
              </div>
              <button className="text-button" onClick={release}>RELEASE STAR →</button>
            </>
          ) : (
            <>
              {!position && <button className="locate-button wide" onClick={locate}>GO FIND IT →</button>}
              {position && (
                <>
                  <div className={"distance-readout " + (found ? "found" : "")}>
                    <strong>{distance}m</strong>
                    <span>{found ? "YOU FOUND IT." : "WALK TO THIS STAR"}</span>
                  </div>
                  {found && (
                    <div className="claim-form">
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                      <textarea value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="What would you like to leave here?" rows={3} />
                      <button className="locate-button wide" onClick={claim}>CLAIM & LEAVE →</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {message && <div className="message">{message}</div>}
        </aside>
      )}

      <div className="map-legend glass">
        <span><i className="legend-star available">★</i> AVAILABLE</span>
        <span><i className="legend-star claimed">★</i> CLAIMED</span>
      </div>

      <footer className="map-footer">
        <span>PLACE → STAR → MEMORY</span>
        <span>STREET STARS · BERLIN</span>
      </footer>
    </main>
  );
}