import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./markets.css";
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
  title: "Oracular — Read the signals. See what comes next.",
  description:
    "Research sports, daily temperatures and elections with evidence-led forecasts, live prediction markets and transparent probability models.",
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
