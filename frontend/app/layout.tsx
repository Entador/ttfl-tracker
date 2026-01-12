import { Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PiBasketball, PiCourtBasketball } from "react-icons/pi";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTFL Tracker",
  description:
    "Track your TTFL player picks and optimize your daily selections",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-md shadow-sm">
          <div className="container mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2 sm:gap-2 text-base sm:text-xl font-bold tracking-tight hover:text-primary transition-colors"
              >
                <PiBasketball className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                <p>TTFL Tracker</p>
              </Link>
              <div className="flex text-sm sm:text-base gap-3 sm:gap-6">
                <Link
                  href="/"
                  className="flex items-center gap-1 px-1 sm:px-2 sm:gap-1.5 py-2 font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                >
                  <PiCourtBasketball size={20} />
                  <span>Dashboard</span>
                </Link>
                <Link
                  href="/history"
                  className="flex items-center gap-1 px-1 sm:px-2 sm:gap-1.5 py-2 font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                >
                  <Clock className="h-4 w-4" />
                  <span>History</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-8">
          {children}
        </main>
        <footer className="border-t mt-16 bg-muted/30">
          <div className="container mx-auto px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              TTFL Tracker - Make smarter picks with data-driven insights
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Elevate your fantasy basketball game
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
