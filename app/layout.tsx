import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GenUI Knowledge Graph",
  description: "Interactive knowledge graph visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Applied GenUI base classes here */}
      <body className="bg-genui-main text-genui-text h-screen w-screen overflow-hidden flex">
        {children}
      </body>
    </html>
  );
}