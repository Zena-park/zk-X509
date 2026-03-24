import type { Metadata } from "next";
import "./globals.css";

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
        <nav className="border-b border-gray-800 px-6 py-3">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <a href="/" className="text-lg font-bold">zk-X509</a>
            <div className="flex gap-4 text-sm">
              <a href="/" className="text-gray-400 hover:text-white">사용자</a>
              <a href="/admin" className="text-gray-400 hover:text-white">관리자</a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
