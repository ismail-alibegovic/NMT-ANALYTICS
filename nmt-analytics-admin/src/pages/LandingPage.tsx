import type { ReactNode } from "react";
import { Link } from "react-router";
import { useT } from "../lib/i18n/context";
import PageMeta from "../components/common/PageMeta";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import { ArrowRight, Reveal } from "../components/landing/primitives";
import {
  BenefitArt,
  BookingPreview,
  CommunicationPreview,
  DeparturePreview,
  HeroDashboard,
  OperationsPreview,
  PassengerPreview,
  PaymentsPreview,
  RevenuePreview,
} from "../components/landing/previews";

const container = "mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8";
const outlineBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-lp-border bg-white px-4 py-2 text-[13px] font-semibold text-lp-text transition-all hover:-translate-y-0.5 hover:border-lp-primary/40 hover:text-lp-primary";

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-lp-text sm:text-[40px] sm:leading-[1.15]">{title}</h2>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-lp-muted">{subtitle}</p>}
    </div>
  );
}

function FeatureSplit({
  id,
  title,
  desc,
  cta,
  href,
  preview,
  previewFirst,
}: {
  id?: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  preview: ReactNode;
  previewFirst: boolean;
}) {
  return (
    <div id={id} className="scroll-mt-24 grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
      <Reveal className={previewFirst ? "" : "lg:order-2"}>
        <div className="rounded-3xl border border-lp-border bg-gradient-to-br from-lp-soft to-white p-6 sm:p-10">{preview}</div>
      </Reveal>
      <Reveal delay={100} className={previewFirst ? "" : "lg:order-1"}>
        <h3 className="text-balance text-2xl font-semibold tracking-tight text-lp-text sm:text-[32px] sm:leading-[1.2]">{title}</h3>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-lp-muted">{desc}</p>
        <a href={href} className={`${outlineBtn} mt-7`}>
          {cta}
          <ArrowRight className="size-3.5" />
        </a>
      </Reveal>
    </div>
  );
}

export default function LandingPage() {
  const { t } = useT();
  const l = t.landing;

  const trust = [l.trust1, l.trust2, l.trust3, l.trust4, l.trust5];
  const features = [
    { id: "feature-bookings", label: l.f1Label, title: l.f1Title, desc: l.f1Desc, preview: <BookingPreview /> },
    { id: "feature-passengers", label: l.f2Label, title: l.f2Title, desc: l.f2Desc, preview: <PassengerPreview /> },
    { id: "feature-departures", label: l.f3Label, title: l.f3Title, desc: l.f3Desc, preview: <DeparturePreview /> },
    { id: "feature-payments", label: l.f4Label, title: l.f4Title, desc: l.f4Desc, preview: <PaymentsPreview /> },
  ];
  const benefits = [
    { title: l.b1Title, desc: l.b1Desc },
    { title: l.b2Title, desc: l.b2Desc },
    { title: l.b3Title, desc: l.b3Desc },
  ];

  return (
    <div className="lp-root relative overflow-x-clip bg-white font-outfit text-lp-text antialiased selection:bg-lp-primary selection:text-white">
      <PageMeta title={`Travline — ${l.heroTitle}`} description={l.heroSubtitle} />
      <LandingNav />

      <main>
        {/* Hero */}
        <section id="top" className="relative scroll-mt-24">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-16 -z-0 h-[720px] bg-[radial-gradient(60%_60%_at_20%_0%,#EFEDFF_0%,transparent_70%),radial-gradient(50%_50%_at_90%_10%,#F4F2FF_0%,transparent_70%)]" />
          <div className={`${container} relative grid items-center gap-14 pb-20 pt-10 sm:pt-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:pb-28 lg:pt-20`}>
            <Reveal>
              <h1 className="text-balance text-[40px] font-semibold leading-[1.08] tracking-tight text-lp-text sm:text-5xl lg:text-[46px] xl:text-6xl">
                {l.heroTitle}
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-lp-muted sm:text-lg">{l.heroSubtitle}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth/signup"
                  className="group inline-flex items-center gap-2 rounded-lg bg-lp-primary px-6 py-3 text-sm font-semibold text-white shadow-md shadow-lp-primary/25 transition-all hover:-translate-y-0.5 hover:bg-lp-primary-hover active:scale-[0.98]"
                >
                  {l.getStarted}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#features" className={`${outlineBtn} !px-6 !py-3 !text-sm`}>
                  {l.exploreFeatures}
                </a>
              </div>
              <p className="mt-6 text-xs text-lp-muted/80">{l.previewNote}</p>
            </Reveal>
            <Reveal delay={150}>
              <HeroDashboard />
            </Reveal>
          </div>
        </section>

        {/* Trust */}
        <section className="pb-20 sm:pb-28">
          <div className={container}>
            <Reveal>
              <p className="text-center text-sm font-medium text-lp-muted">{l.trustTitle}</p>
              <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
                {trust.map((item, i) => (
                  <li key={item} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true" className="hidden size-1 rounded-full bg-lp-primary/40 sm:block" />}
                    <span className="px-3 text-lg font-semibold tracking-tight text-lp-text/70 sm:text-xl">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 pb-24 sm:pb-32">
          <div className={container}>
            <Reveal>
              <SectionHeading title={l.featuresTitle} subtitle={l.featuresSubtitle} />
            </Reveal>
            <div className="mt-14 grid gap-5 md:grid-cols-2">
              {features.map((f, i) => (
                <Reveal key={f.id} delay={(i % 2) * 100}>
                  <article
                    id={f.id}
                    className="group h-full scroll-mt-24 rounded-3xl border border-lp-border bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(98,88,232,0.25)] sm:p-7"
                  >
                    <div className="flex items-center rounded-2xl bg-gradient-to-br from-lp-soft to-white p-4 sm:min-h-[310px] sm:p-6"><div className="w-full">{f.preview}</div></div>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-lp-primary">{f.label}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-lp-text">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-lp-muted">{f.desc}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section id="how-it-works" className="scroll-mt-20 pb-24 sm:pb-32">
          <div className={container}>
            <Reveal>
              <SectionHeading title={l.benefitsTitle} />
            </Reveal>
            <Reveal delay={100}>
              <div className="mt-12 rounded-[32px] bg-lp-soft p-4 sm:p-8">
                <div className="grid gap-4 md:grid-cols-3">
                  {benefits.map((b, i) => (
                    <div key={b.title} className="rounded-2xl border border-lp-border bg-white p-5 transition-shadow hover:shadow-[0_16px_40px_-20px_rgba(98,88,232,0.3)]">
                      <BenefitArt kind={i as 0 | 1 | 2} />
                      <h3 className="mt-5 text-lg font-semibold tracking-tight text-lp-text">{b.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-lp-muted">{b.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Alternating sections */}
        <section id="solutions" className="scroll-mt-20 pb-24 sm:pb-32">
          <div className={`${container} space-y-24 sm:space-y-32`}>
            <FeatureSplit title={l.s1Title} desc={l.s1Desc} cta={l.s1Cta} href="#features" preview={<CommunicationPreview />} previewFirst />
            <FeatureSplit title={l.s2Title} desc={l.s2Desc} cta={l.s2Cta} href="#feature-payments" preview={<RevenuePreview />} previewFirst={false} />
            <FeatureSplit title={l.s3Title} desc={l.s3Desc} cta={l.s3Cta} href="#feature-departures" preview={<OperationsPreview />} previewFirst />
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative bg-gradient-to-b from-white via-lp-soft to-lp-soft py-24 sm:py-32">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lp-float absolute left-[6%] top-[22%] hidden h-16 w-36 rounded-xl border border-lp-border bg-white/80 shadow-sm lg:block" />
            <div className="lp-float absolute bottom-[18%] right-[7%] hidden h-20 w-40 rounded-xl border border-lp-border bg-white/80 shadow-sm [--lp-delay:1.6s] lg:block" />
          </div>
          <div className={`${container} relative`}>
            <Reveal>
              <div className="mx-auto max-w-3xl text-center">
                <h2 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-lp-text sm:text-6xl">{l.ctaTitle}</h2>
                <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-lp-muted sm:text-lg">{l.ctaSubtitle}</p>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
                  <Link
                    to="/auth/signup"
                    className="inline-flex items-center gap-2 rounded-lg bg-lp-primary px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-lp-primary/25 transition-all hover:-translate-y-0.5 hover:bg-lp-primary-hover active:scale-[0.98]"
                  >
                    {l.ctaPrimary}
                    <ArrowRight className="size-4" />
                  </Link>
                  <a href="#features" className="text-sm font-semibold text-lp-text underline-offset-4 transition-colors hover:text-lp-primary hover:underline">
                    {l.ctaSecondary}
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
