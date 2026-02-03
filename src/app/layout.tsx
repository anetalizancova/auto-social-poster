import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Social Poster - Aibility",
  description: "Automatické postování na X a Threads pro Aibility",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
