# Travline — Improvement & Productization Plan

**Status:** Radni dokument koji vodi razvoj od trenutnog stanja (interni MVP, jedan živi tenant) do prodajno gotovog SaaS proizvoda za tržište Bosne, Hrvatske i Srbije.

**Namjena dokumenta:** Ovo je referentni dokument za svaki AI agent (Claude, Cursor, drugi) koji radi na kodu. Cilj je da agent ne luta, ne izmišlja arhitekturu iznova, i ne radi van dogovorenog obima. Prije bilo kakvog rada na kodu, agent treba pročitati sekcije 1 i 2 u cjelosti.

---

## 1. Ne-pregovarljiva pravila za svakog AI agenta

Ovo su pravila koja se ne krše bez izričite Ismailove dozvole, bez obzira koliko "logično" izgleda izuzetak u datom trenutku.

1. **Jedan izvor istine za DB šemu.** Sve migracije idu isključivo u `nmt-analytics-api/supabase/migrations/` (Supabase CLI timestamp format). Nikad ne kreirati nove fajlove u `supabase/sql/` ili `docs/sql/` — ti folderi su arhiva i ne smiju rasti dalje. Ako agent nije siguran koja je trenutna živa šema, prvo pita ili čita direktno iz Supabase, ne pretpostavlja iz stare `sql/` skripte.
2. **Nikad ne commit-ovati fajlove sa stvarnim kredencijalima ili API ključevima**, čak ni u `.env.production.local`, `.env.local`, ili slično imenovane fajlove. Prije svakog commita, agent provjerava da li je novi/izmijenjeni fajl u `.gitignore`. Ako fajl sadrži bilo šta nalik JWT-u, service key-u, lozinci — stani i pitaj.
3. **Role hijerarhija se ne zaobilazi.** `viewer < agent < manager < director < super_admin`. Svaka nova ruta MORA imati eksplicitan `requireMinimumRole()` na backendu — ne osloniti se samo na frontend gating (frontend gating je UX, backend gating je sigurnost).
4. **Svaka nova tabela ima `org_id` kolonu i RLS politiku od prvog dana.** Ovo je multi-tenant sistem — greška ovdje znači da jedan klijent vidi podatke drugog klijenta. Ovo je najozbiljnija moguća greška u ovom projektu i tretira se kao takva.
5. **Financijski izračuni (uplate, rate, balans) se ne diraju bez čitanja `FINANCIAL_TRUTH_FIELDS.md` i `PAYMENT_CORRECTION_FLOWS.md` prvo.** Ovo je oblast gdje je već bilo više rundi bagova (vidljivo iz historije fajlova) — ne ponavljati iste greške.
6. **Ne dodavati novu biblioteku/zavisnost bez provjere da li već postoji ekvivalent u projektu.** Projekat već ima duple zavisnosti (bun.lock + package-lock.json, dva test fajla za isti test) — cilj je smanjivati, ne povećavati entropiju.
7. **Ne brisati/mijenjati `AGENTS.md` strukturu** — to je živi indeks projekta. Svaka završena faza/feature dobija kratak unos tamo, po istom obrascu kao postojeći unosi.
8. **Scope discipline.** Ako je zadatak "dodaj X", agent dodaje X — ne refaktoriše usput nepovezane dijelove koda osim ako to nije eksplicitno traženo. Male, pregledne izmjene > velike, teško-provjerljive izmjene.
9. **Svaka nova ruta koja prima korisnički input ide kroz Zod validaciju**, po istom obrascu kao postojeće rute.
10. **Testiraj prije nego što kažeš da je gotovo.** Minimalno: TypeScript build prolazi, ESLint nema grešaka, a za finansijske/PDF putanje — ručni smoke test opisan u koraku.

---

## 2. Trenutno stanje (sažetak — puna analiza u prethodnim porukama)

- Monorepo: `nmt-analytics-api` (Express 5 + TS + Supabase) i `nmt-analytics-admin` (React 19 + Vite + Tailwind)
- Multi-tenant preko `org_id` na shared Supabase projektu, RLS + role hijerarhija
- Funkcionalno pokriveno: klijenti, paketi, polasci, rezervacije, uplate/rate, ugovori, fiskalni računi (interni format), vaučeri, sub-agenti, ekskurzije, hoteli/sobe, eTurista integracija (CIS Srbija), audit log, notifikacije, AI predikcije popunjenosti
- Deployed na Zo Computer (`travline-sprypine.zocomputer.io`), jedan produkcijski tenant trenutno aktivan
- **Kritičan sigurnosni nalaz (vidi Fazu 0):** commit-ovan pravi Supabase service_role ključ u javnom repou

---

## 3. FAZA 0 — Sigurnosna sanacija (prije bilo čega drugog)

| Zadatak | Definition of Done |
|---|---|
| Rotacija Supabase ključeva (anon + service_role) | Novi ključevi generisani u Supabase dashboardu, stari onemogućeni |
| Ažuriranje produkcijskog env-a | Zo servis radi sa novim ključevima, `/api/health` vraća OK |
| Uklanjanje `.env.production.local` iz repoa | `git rm --cached`, dodato u `.gitignore` (`.env*.local` pattern, ne samo `.env`) |
| Čišćenje git historije | `git filter-repo` ili BFG pokrenut, stari commit sa ključem više nije dostupan u historiji |
| Premještanje kredencijala iz `AGENTS.md` | Demo/admin lozinke premještene u password manager ili Zo secrets, `AGENTS.md` referencira samo gdje se nalaze |
| Rotacija demo lozinki (`NmtAdmin2025!` i sl.) | Nove lozinke postavljene na svim demo nalozima |

---

## 4. FAZA 1 — Konsolidacija i čišćenje (workflow higijena)

Cilj: da bilo koji agent (ili novi developer) za 10 minuta razumije "gdje je istina" za bilo koji dio sistema.

- **DB migracije:** generisati jednu baseline migraciju iz trenutnog stanja produkcijske baze u `supabase/migrations/`, arhivirati `supabase/sql/*` i `nmt-analytics-admin/docs/sql/*` u `/docs/archive/legacy-sql/` sa README koji objašnjava da su historijski i da se ne koriste dalje.
- **Dead code:** obrisati `src/routes/public.ts.bak`, jedan od dva reservationPayments test fajla (zadržati `.ts`), `reseed_2026.ts`/`reseed_2026_v2.ts` (ili premjestiti u `scripts/` sa jasnim imenom ako su i dalje korisni).
- **Package manager:** izabrati npm (jer ga CI koristi), obrisati `bun.lock` iz oba paketa.
- **Audit/fix `.md` fajlovi (40+):** premjestiti sve u `/docs/archive/` po paketu, zadržati samo `AGENTS.md` + `CHANGELOG.md` kao aktivnu dokumentaciju.
- **Template debris u adminu:** ukloniti neiskorištene demo komponente i slike (ecommerce widgeti, chat/task demo, mock avatari) iz builda — provjeriti prvo da li se ijedna referencira u aktivnim rutama pre brisanja.
- **npm audit dug:** riješiti `swiper` (ukloniti ako se koristi samo za CSS import), procijeniti zamjenu za `xlsx` ili ograničiti na CSV-only u produkciji.

---

## 5. Konkurentska analiza — šta rade drugi i šta nedostaje Travline-u

### 5.1 Regionalni direktni konkurenti (isto tržište, ista logika poslovanja)

**TuristAgent** (Srbija) — direktni benchmark koji već koristiš za feature adoption. Pokriva: najave, uplate, fiskalni računi, vauceri, ugovori, knjiga evidencije, dnevni pazar, presek smene, anketiranje putnika post-putovanja, CIS/eTurista unos. Travline je već usvojio većinu ovoga (Faza A/B/C u AGENTS.md).

**TravelOS** (Srbija, noviji, "ERP" pozicioniranje) — ističe se sa tri stvari koje Travline **nema**:
- **AI chatbot modul** koji automatski čita cjenovnike organizatora (PDF/Word/Excel), strukturira ih u bazu, i odgovara klijentima na sajtu/Viberu/Facebooku uz handoff agentu sa punim kontekstom razgovora kad je potrebna ljudska intervencija.
- **Booking plugin** kao ugradiv WordPress plugin ili embeddable widget za sajt agencije (Travline ima public booking widget kao HTML embed — TravelOS ide korak dalje sa WP pluginom specifično).
- **KEPTA evidencija** — automatsko generisanje pri svakom realizovanom putovanju (ovo je zakonska evidencija u Srbiji, provjeri da li se odnosi i na BiH tržište ili je Srbija-specifično).
- **Vizuelna mapa sedišta za autobus** sa automatskom dodjelom i praćenjem zauzetosti po polasku — Travline ima `transport_type`/`transport_capacity` polja ali nema vizuelni seat-map UI.

**AgTravelSoft** — širi obuhvat (organizator/subagent/menadžer uloge, iznajmljivači smeštaja, prevoznici) — potvrđuje da je sub-agent + hotel model koji Travline već ima (Faza B) ispravan pravac.

### 5.2 Međunarodni igrači (drugačije tržište, ali korisne ideje za feature parity)

| Platforma | Fokus | Ideja koju vrijedi razmotriti za Travline |
|---|---|---|
| **Bókun** (Tripadvisor) | Tour/activity booking, OTA distribucija | Real-time sinhronizacija dostupnosti kroz više kanala (kad se popuni slot na sajtu, blokira se i na OTA-ima) |
| **Peek Pro** | Operacije + AI | AI copilot za marketing sadržaj i raspoređivanje osoblja; dynamic pricing baziran na potražnji/sezoni |
| **FareHarbor** | All-in-one, jednostavnost | Digital waivers (potpisi/pristanci putnika), abandoned cart recovery za nedovršene rezervacije |
| **Rezdy** | Distribucija kroz reseller mrežu | Reseller/affiliate portal — Travline već ima sub-agente, ali nema self-serve portal gdje sub-agent sam vidi svoju proviziju/statistiku |
| **Ezus** | DMC/boutique proposal tool | Proposal builder — vizuelno lijepa ponuda za klijenta prije potvrde rezervacije, ne samo interni ugovor |
| **Travel Booster** | Enterprise travel-ERP | Business rules engine za automatske markupe/provizije po tipu partnera — korisno kad broj sub-agenata poraste |
| **Vamoos** | Client-facing trip app | Digitalni "trip companion" za putnika — itinerar, dokumenti, real-time update, offline pristup — nešto što bi klijent (putnik) dobio, ne samo agencija |

### 5.3 Konkretni prijedlozi feature-a za Travline (prioritizovano)

**Visoka vrijednost, relativno jednostavno:**
1. Vizuelna mapa sedišta za autobuske polaske (drag-and-drop ili klik-dodjela, boja po statusu: slobodno/rezervisano/blokirano)
2. Digitalni pristanak/potpis putnika (waiver) za ekskurzije koje to zahtijevaju
3. Sub-agent self-serve portal (login sa ograničenim pogledom: svoje rezervacije, svoja provizija, status isplate)
4. Automatski markup/provizija po tipu partnera (business rules na `package_services`/`subagents`)

**Srednja vrijednost, veći obim:**
5. AI chatbot za prve upite klijenata (parsira cjenovnik, odgovara na sajtu/Viberu, handoff agentu) — najveći diferencijator TravelOS-a, ali i najveći inženjerski poduhvat
6. Client-facing "moje putovanje" mikro-portal — putnik dobije link sa svojim vaučerom, ugovorom, terminom, kontaktom vodiča (bez potrebe za nalogom)
7. Real-time dostupnost sinhronizovana sa javnim booking widgetom (trenutno je "read-only" per departure — provjeriti da li se ažurira odmah nakon svake rezervacije)

**Niža hitnost, ali strateški bitno kad broj klijenata poraste:**
8. Reseller/affiliate statistika i dashboard za sub-agente
9. Proposal builder (vizuelna ponuda prije nego što se pretvori u ugovor) — korisno za agencije koje prodaju individualne/luksuzne aranžmane, ne samo grupne polaske

---

## 6. Regulatorni zahtjevi po tržištu — ovo nije opciono

Travline cilja BiH, Hrvatsku i Srbiju — svaka ima drugačiji fiskalni/izvještajni režim, i sva tri su u aktivnoj promjeni tokom 2026:

- **Srbija — CIS/eTurista:** već implementirano (Faza C, `eturistaClient.ts` sa SSRF zaštitom). Provjeriti povremeno da li se format payloada mijenja.
- **Hrvatska — Fiskalizacija 2.0:** na snazi od 1.1.2026. Ključna promjena za agencije: **bezgotovinske transakcije (akontacije, predujmovi, plaćanja karticom/transferom) sada se moraju fiskalizovati u realnom vremenu**, ne samo gotovinske. Obavezna razmjena e-računa u B2B poslovanju (agencija ↔ hotel, agencija ↔ prevoznik) od 2027. Ako Travline ima hrvatske klijente ili to planira, `payments.ts` i `receiptGenerator.ts` moraju podržati ovaj tok — trenutni sistem generiše interne PDF priznanice, ne fiskalizovane u realnom vremenu prema hrvatskoj poreznoj upravi.
- **FBiH — novi Zakon o fiskalizaciji transakcija:** usvojen februar 2026, uvodi ESET (Elektronski Sistem za Evidentiranje Transakcija) koji zamjenjuje klasičnu fiskalnu kasu softverskim rješenjem (aplikacija, program, cloud servis). Primjena počinje najkasnije 18 mjeseci od stupanja na snagu (okvirno do 31.8.2027), sa prelaznim periodom do 2030/2031. **Ovo je prilika, ne samo obaveza** — ako Travline implementira ESET integraciju prije konkurencije, to je snažan prodajni argument za bosanske agencije koje će morati mijenjati sistem svakako.

**Preporuka:** napraviti apstraktni "fiscal compliance" sloj (interfejs, ne hardkodirana implementacija) sa provider-specifičnim adapterima — `eturista` (RS), `eset-fbih` (BiH, kad podzakonski akti izađu), `fiskalizacija-hr` (HR) — po istom obrascu kao `eturistaClient.ts`, tako da dodavanje novog tržišta ne znači prepravku jezgra sistema.

---

## 7. Faza 2 — Multi-tenant self-serve onboarding

| Zadatak | Definition of Done |
|---|---|
| "Create organization" flow | Novi korisnik se registruje → automatski kreiran `organizations` red, default `org_modules` set, korisnik postaje `director` — bez ručne intervencije |
| Org branding tabela | `org_branding` (logo, boje, naziv) čita se u `pdfGenerator.ts`, `contractGenerator.ts`, `receiptGenerator.ts` umjesto hardkodiranog "Travline" brendiranja |
| Plan/tier na organizaciji | Kolona `plan` na `organizations`, mapiranje plan→`org_modules` (infrastruktura za gating već postoji) |
| Onboarding checklist u UI | Novi tenant vidi progress checklist (dodaj prvi paket, prvi polazak, konfiguriši eTurista/fiskalizaciju) |

## 8. Faza 3 — Naplata

- Prvih 5-10 klijenata: ručna naplata (faktura + ugovor), ne trošiti vrijeme na Stripe prerano
- Nakon toga: Stripe subscriptions + webhook → `organizations.subscription_status`, trial period, dunning email

## 9. Faza 4 — Kvalitet i skaliranje

- Testovi na kritičnim putanjama: atomic reservation capacity RPC, payment/installment kalkulacije, PDF generisanje (broj/valuta se ne smiju rasipati)
- Riješiti `npm audit` nalaze (`xlsx`, `swiper`, `picomatch`)
- Monitoring/alerting (Sentry ili slično) — sa više tenanata na istoj bazi, greška jednog org-a ne smije proći nezapaženo

---

## 10. Redoslijed rada (za agenta koji planira sprint)

1. Faza 0 (sigurnost) — ne kreće ništa drugo dok ovo nije gotovo
2. Faza 1 (konsolidacija) — čisti teren prije nego što se doda još koda
3. Regulatorni sloj (sekcija 6) — apstraktni interfejs, počevši sa onim tržištem gdje Travline ima ili očekuje prvog plaćajućeg klijenta
4. Faza 2 (onboarding) — preduslov za bilo kakvu prodaju van prvog tenanta
5. Feature prijedlozi iz sekcije 5.3, po prioritetu "visoka vrijednost/jednostavno" prvo
6. Faza 3 (naplata) — kad postoji realan broj klijenata koji to opravdava
7. Faza 4 (kvalitet) — kontinuirano, paralelno sa svime iznad

Svaka završena stavka dobija kratak unos u `AGENTS.md` po postojećem obrascu (naziv, datum, šta je urađeno, koje rute/fajlove dotiče).
