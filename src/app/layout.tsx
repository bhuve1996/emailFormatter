import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Template Visualizer & Editor",
  description: "Paste template code, preview with dummy data, edit visually, get back formatted output with variables intact.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
