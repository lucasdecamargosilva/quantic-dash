import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const helveticaDisplay = localFont({
  src: "./fonts/helveticanowdisplay-medium.ttf",
  variable: "--font-display",
  display: "swap",
  weight: "500",
});

export const metadata: Metadata = {
  title: "Provador Virtual — Gerador de fotos com IA",
  description:
    "Transforme fotos de produto em campanhas: 1 modelo + 3 ângulos de estúdio, com verificação automática de fidelidade.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${helveticaDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
