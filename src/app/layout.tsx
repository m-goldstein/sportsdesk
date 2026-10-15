import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const sans = localFont({
  src: "./fonts/dm-sans.woff2",
  variable: "--font-sans",
  display: "swap",
});
const display = localFont({
  src: "./fonts/manrope.woff2",
  variable: "--font-display",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Sportsdesk — Read the game. Find your edge.",
  description:
    "An evidence-first research desk for sports, betting and prediction markets. Explore matchups, team form, player availability and market probabilities.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
