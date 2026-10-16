import { Link } from "react-router";
import { useT } from "../../lib/i18n/context";
import { Logo } from "./primitives";

export default function LandingFooter() {
  const { t } = useT();
  const l = t.landing;
  const platform = [
    { href: "#features", label: l.navFeatures },
    { href: "#feature-bookings", label: l.trust1 },
    { href: "#feature-passengers", label: l.trust2 },
    { href: "#feature-departures", label: l.trust3 },
    { href: "#feature-payments", label: l.trust4 },
  ];
  const linkCls = "text-sm text-white/60 transition-colors hover:text-white";
  return (
    <footer className="bg-[#080809] text-white">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg font-bold tracking-tight">Travline</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/60">{l.footerDesc}</p>
          <p className="mt-8 text-xs text-white/40">{l.copyright}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{l.footerPlatform}</h3>
          <ul className="mt-4 space-y-3">
            {platform.map((p) => (
              <li key={p.href}><a href={p.href} className={linkCls}>{p.label}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{l.footerAccount}</h3>
          <ul className="mt-4 space-y-3">
            <li><Link to="/auth/signin" className={linkCls}>{l.signIn}</Link></li>
            <li><Link to="/auth/signup" className={linkCls}>{l.footerSignUp}</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
