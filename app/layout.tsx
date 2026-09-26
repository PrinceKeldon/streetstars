import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Street Stars — Berlin",
  description: "Give the streets a memory.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}