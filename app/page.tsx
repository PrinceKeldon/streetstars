"use client";

import { useEffect, useMemo, useState } from "react";

type Star = { id: string; street: string; lat: number; lon: number; status: "available" | "claimed" | "resting"; claimant?: string; memory?: string; availableAt?: number };

const BERLIN = { lat: 52.5200, lon: 13.4050 };
const SEED: Star[] = [
  { id: "BERLIN-001", street: "Oranienstraße", lat: 52.499, lon: 13.423 },
  { id: "BERLIN-002", street: "Weserstraße", lat: 52.545, lon: 13.424 },
  { id: "BERLIN-003", street: "Kastanienallee", lat: 52.538, lon: 13.411 },
  { id: "BERLIN-004", street: "Karl-Marx-Allee", lat: 52.518, lon: 13.447 },
  { id: "BERLIN-005", street: "Reichenberger Straße", lat: 52.495, lon: 13.431 },
  { id: "BERLIN-006", street: "Warschauer Straße", lat: 52.506, lon: 13.451 },
];

function distanceMetres(a: {lat:number;lon:number}, b: {lat:number;lon:number}) {
  const R = 6371000, p1 = a.lat*Math.PI/180, p2 = b.lat*Math.PI/180;
  const dp = (b.lat-a.lat)*Math.PI/180, dl = (b.lon-a.lon)*Math.PI/180;
  const h = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

export default function Home() {
  const [stars, setStars] = useState(SEED);
  const [selected, setSelected] = useState<Star | null>(null);
  const [position, setPosition] = useState<typeof BERLIN | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [memory, setMemory] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("streetstars:stars");
    if (raw) setStars(JSON.parse(raw));
  }, []);
  useEffect(() => localStorage.setItem("streetstars:stars", JSON.stringify(stars)), [stars]);

  const distance = selected && position ? Math.round(distanceMetres(position, selected)) : null;
  const found = distance !== null && distance <= 75;

  const locate = () => navigator.geolocation?.getCurrentPosition(
    p => setPosition({lat:p.coords.latitude, lon:p.coords.longitude}),
    () => setPosition(BERLIN)
  );

  const claim = () => {
    if (!selected || !found || !name.trim()) return;
    setStars(prev => prev.map(s => s.id === selected.id ? {...s, status:"claimed", claimant:name.trim(), memory:memory.trim()} : s));
    setSelected({...selected, status:"claimed", claimant:name.trim(), memory:memory.trim()});
    setMessage("YOU FOUND IT. This Star is yours to leave something at.");
  };

  const release = () => {
    if (!selected) return;
    const delay = (6 + Math.floor(Math.random()*67))*60*60*1000;
    const next = {...selected, status:"resting" as const, claimant:undefined, availableAt:Date.now()+delay};
    setStars(prev => prev.map(s => s.id === selected.id ? next : s));
    setSelected(next);
    setMessage("STAR RELEASED. It will return at an unpredictable time.");
  };

  const visibleStars = useMemo(() => stars.map(s => s.availableAt && s.availableAt <= Date.now() ? {...s,status:"available" as const,availableAt:undefined} : s), [stars]);

  return <main>
    <header><div className="brand">STREET STARS</div><div className="edition">BERLIN · EDITION I · 2026–2030</div></header>
    <section className="intro"><p className="eyebrow">A FINITE LAYER OF DIGITAL STARS ANCHORED TO REAL STREETS</p><h1>Give the streets<br/><em>a memory.</em></h1><p className="lede">Walk somewhere. Find a Star. Leave something meaningful behind.</p></section>
    <section className="discover">
      <div className="map" aria-label="Berlin Star map">
        <div className="map-title">DISCOVER NEARBY STARS</div>
        <div className="streets s1"/><div className="streets s2"/><div className="streets s3"/>
        {visibleStars.map(s => <button key={s.id} className={"star-dot "+s.status} style={{left:(8+(s.lon-13.40)*1900)+"%",top:(65-(s.lat-52.49)*1000)+"%"}} onClick={()=>setSelected(s)} aria-label={s.id}>★</button>)}
        <button className="locate" onClick={locate}>USE MY LOCATION</button>
      </div>
      <aside className="panel">
        {!selected ? <><span className="eyebrow">THE PRIMITIVE</span><h2>Find one.</h2><p>Stars are permanent place markers. Claims are temporary. Memories can be released. Once a Star opens again, the first person physically there can claim it.</p><div className="rule"/><p className="small">No ownership. No transfer. No sale. The Star belongs to the street.</p></> : <>
          <span className="eyebrow">{selected.status.toUpperCase()}</span><h2>{selected.id}</h2><p>{selected.street} · Berlin</p>
          {selected.status === "resting" ? <><div className="status-box">This Star is resting.<br/>It will return without warning.</div><button className="secondary" onClick={()=>setSelected(null)}>BACK TO MAP</button></> : selected.status === "claimed" ? <><div className="status-box">Claimed by {selected.claimant}.<br/><br/>{selected.memory && <em>“{selected.memory}”</em>}</div><button className="secondary" onClick={release}>RELEASE STAR</button></> : <>
            <button className="primary" onClick={locate}>GO FIND IT →</button>
            {position && <p className="distance">{distance !== null ? distance + " m away" : "Location available"}</p>}
            {found && <div className="claim-box"><strong>YOU FOUND IT.</strong><input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name"/><textarea value={memory} onChange={e=>setMemory(e.target.value)} placeholder="What would you like to leave here?" rows={4}/><button className="primary" onClick={claim}>CLAIM & LEAVE</button></div>}
          </>}
          {message && <p className="message">{message}</p>}
        </>}
      </aside>
    </section>
    <footer><span>PLACE → STAR → MEMORY → DISCOVERY</span><span>OPEN SOURCE · APACHE-2.0</span></footer>
  </main>;
}