import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "../pages/LandingPage";
import { I18nProvider } from "../lib/i18n/context";
import { ThemeProvider } from "../context/ThemeContext";

vi.mock("../components/common/PageMeta", () => ({
  default: () => null,
}));

function renderLanding() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter>
          <LandingPage />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}

describe("LandingPage", () => {
  it("renders hero headline and primary CTAs pointing at auth routes", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { level: 1, name: /Travel agency management|Upravljanje turističkom agencijom/i })
    ).toBeInTheDocument();

    const signIn = screen.getAllByRole("link", { name: /Log In|Prijava/i });
    expect(signIn.every((a) => a.getAttribute("href") === "/auth/signin")).toBe(true);

    const getStarted = screen.getAllByRole("link", { name: /Get Started|Započnite/i });
    expect(getStarted.length).toBeGreaterThan(0);
    expect(getStarted.every((a) => a.getAttribute("href") === "/auth/signup")).toBe(true);
  });

  it("renders the four feature cards", () => {
    renderLanding();

    for (const re of [
      /Booking Management|Upravljanje rezervacijama/i,
      /Passenger Management|Upravljanje putnicima/i,
      /Departure Management|Upravljanje polascima/i,
      /Payments & Revenue|Uplate i prihodi/i,
    ]) {
      expect(screen.getByText(re, { selector: "p" })).toBeInTheDocument();
    }
  });

  it("every in-page anchor resolves to an element on the page", () => {
    const { container } = renderLanding();
    const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).map((a) =>
      a.getAttribute("href")!.slice(1)
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const id of hrefs) {
      expect(container.querySelector(`#${id}`), `#${id}`).not.toBeNull();
    }
  });

  it("toggles between Bosnian and English copy", () => {
    renderLanding();

    const nav = screen.getByRole("navigation", { name: /Main navigation|Glavna navigacija/i });
    const before = within(nav).getAllByRole("link")[1].textContent;

    fireEvent.click(screen.getByRole("button", { name: /^(EN|BS)$/ }));

    expect(within(screen.getByRole("navigation", { name: /Main navigation|Glavna navigacija/i })).getAllByRole("link")[1].textContent).not.toBe(before);
  });
});
