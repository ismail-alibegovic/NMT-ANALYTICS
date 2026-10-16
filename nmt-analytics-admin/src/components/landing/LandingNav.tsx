import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useT } from "../../lib/i18n/context";
import { Logo } from "./primitives";

export default function LandingNav() {
  const { t, lang, setLang } = useT();
  const l = t.landing;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.getElementById("lp-menu-toggle")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { href: "#top", label: l.navHome },
    { href: "#features", label: l.navFeatures },
    { href: "#how-it-works", label: l.navHow },
    { href: "#solutions", label: l.navSolutions },
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-lp-border bg-white/80 backdrop-blur-lg"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo />
          <span className="text-lg font-bold tracking-tight text-lp-text">Travline</span>
        </Link>

        <nav aria-label={l.mainNav} className="hidden items-center gap-9 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-[13px] font-medium text-lp-muted transition-colors hover:text-lp-text">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setLang(lang === "bs" ? "en" : "bs")}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-lp-muted transition-colors hover:text-lp-text"
          >
            {lang === "bs" ? "EN" : "BS"}
          </button>
          <Link to="/auth/signin" className="hidden text-[13px] font-semibold text-lp-text transition-colors hover:text-lp-primary sm:inline">
            {l.signIn}
          </Link>
          <Link
            to="/auth/signup"
            className="rounded-lg bg-lp-primary px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-lp-primary/25 transition-all hover:bg-lp-primary-hover active:scale-[0.98]"
          >
            {l.getStarted}
          </Link>
          <button
            id="lp-menu-toggle"
            type="button"
            aria-label={open ? l.closeMenu : l.openMenu}
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-lp-text md:hidden"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {open ? <path d="M5 5l10 10M15 5 5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="lp-mobile-menu" aria-label={l.mainNav} className="border-t border-lp-border bg-white/95 px-4 pb-4 pt-2 md:hidden">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-sm font-medium text-lp-text">
              {link.label}
            </a>
          ))}
          <Link to="/auth/signin" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-sm font-semibold text-lp-primary">
            {l.signIn}
          </Link>
        </nav>
      )}
    </header>
  );
}
