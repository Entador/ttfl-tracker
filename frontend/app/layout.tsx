import type { Metadata } from "next";
import Link from "next/link";
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
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2 text-2xl font-bold tracking-tight hover:text-primary transition-all hover:scale-105"
              >
                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                  <span className="text-white text-sm font-black">TT</span>
                </div>
                <span className="hidden sm:inline bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  TTFL Tracker
                </span>
              </Link>
              <div className="flex gap-1 sm:gap-2">
                <Link
                  href="/"
                  className="px-3 sm:px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                >
                  Dashboard
                </Link>
                <Link
                  href="/history"
                  className="px-3 sm:px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                >
                  History
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
