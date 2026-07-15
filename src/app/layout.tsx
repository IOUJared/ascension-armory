import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ascension Armory — Conquest Gear Planner",
  description: "EP-based gear planning for Project Ascension: Conquest of Azeroth.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
