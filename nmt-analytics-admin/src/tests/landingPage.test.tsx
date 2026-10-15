import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "../pages/LandingPage";
import { I18nProvider } from "../lib/i18n/context";
import { ThemeProvider } from "../context/ThemeContext";

vi.mock("../components/common/PageMeta", () => ({
  default: () => null,
}));

vi.mock("../icons", () => {
  const Icon = (props: any) => <svg data-testid="icon" {...props} />;
  return {
    ArrowRightIcon: Icon,
    BoxIconLine: Icon,
    CalenderIcon: Icon,
    CheckCircleIcon: Icon,
    DollarLineIcon: Icon,
    GroupIcon: Icon,
    LockIcon: Icon,
    TableIcon: Icon,
  };
});

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
  it("renders hero section with title and CTA buttons", () => {
    renderLanding();

    expect(screen.getAllByText(/Travline/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sign In|Prijava na sistem/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Get Started|Započnite odmah/i).length).toBeGreaterThan(0);
  });

  it("renders core capability feature cards", () => {
    renderLanding();

    expect(screen.getByText(/Commercial & Sales Pipeline|Prodajni lijevak i rezervacije/i)).toBeInTheDocument();
    expect(screen.getByText(/Visual Seating & Transport|Vizuelno sjedenje i transport/i)).toBeInTheDocument();
    expect(screen.getByText(/Accommodation & Rooming|Smještaj i sobe/i)).toBeInTheDocument();
    expect(screen.getByText(/Finance & Obligations|Finansije i dobavljači/i)).toBeInTheDocument();
  });

  it("toggles between Bosnian and English copy", () => {
    renderLanding();

    const toggleBtn = screen.getByRole("button", { name: /EN|BS/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByRole("button", { name: /EN|BS/i })).toBeInTheDocument();
  });
});
