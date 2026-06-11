import type { Metadata } from "next";
import { Space_Grotesk, Manrope, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { AssistantWidget } from "@/components/AssistantWidget";
import { WalletProvider } from "@/lib/wallet";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "ZK-X509 | Zero-Knowledge Certificate Verification",
  description:
    "Cryptographic identity management for secure X.509 certificate validation using zero-knowledge architecture.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-surface text-on-surface font-body">
        <WalletProvider>
          <Navbar />
          {children}
          <AssistantWidget />
        </WalletProvider>
      </body>
    </html>
  );
}
