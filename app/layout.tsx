import "./globals.css";
import "./map.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Street Stars — Berlin",
  description: "Give the streets a memory.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}