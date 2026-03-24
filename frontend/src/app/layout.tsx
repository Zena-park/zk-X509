import type { Metadata } from "next";
import "./globals.css";
import { NavBarProvider } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "zk-X509 | Zero-Knowledge Certificate Verification",
  description: "Verify your X.509 certificate identity on-chain without revealing personal data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        <NavBarProvider>
          {children}
        </NavBarProvider>
      </body>
    </html>
  );
}
