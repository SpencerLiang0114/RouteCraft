import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RouteCraft",
  description: "Personalized running, hiking, and cycling route planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f7f5ee] text-stone-950">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
