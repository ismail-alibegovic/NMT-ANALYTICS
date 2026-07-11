# Travline — Prompti za AI agente

Ovo su gotovi prompti koje možeš copy-paste-ovati u razgovor sa Claude, Cursor agent, ili bilo kojim drugim AI-om koji radi na Travline kodu. Svaki prompt referencira `TRAVLINE_IMPROVEMENT_PLAN.md` kao izvor istine za pravila i prioritete.

---

## 1. POČETNI PROMPT — prije nego što agent krene sa bilo čim

```
Čitam ti priloženi `TRAVLINE_IMPROVEMENT_PLAN.md` — to je autoritet za sve 
što radiš na Travline projektu. Prije nego što odgovoriš sa bilo kakvom 
idejom/kodom:

1. PRVO pročitaj **sekciju 1** ("Ne-pregovarljiva pravila"). To su tvoje 
   ograde. Ako se ikada čini da je neko pravilo u suprotnosti sa "boljim" 
   rješenjem — stani i pitaj, ne previđi pravilo.

2. Pročitaj **sekciju 2** (trenutno stanje) da se orientiraš šta je već tamo.

3. Pročitaj **sekciju 10** (redoslijed rada) da razumiješ prioritete.

Sada — šta trebam od tebe?
```

---

## 2. FEATURE DEVELOPMENT — dodavanje nove funkcionalnosti

```
Trebam dodati [OPIS FEATUREA]. Provjeri TRAVLINE_IMPROVEMENT_PLAN.md:

- Je li to uključeno u nekom od faznih planova (sekcije 5-9)?
- Ako jeste, koji je prioritet i šta je prerequisite prije nego što počnem?
- Ako nije u planu, gdje bi logički trebalo da bude?

Nakon što mi recitaš gdje bi to trebalo, spremi se da:
- Kritiziraš moj pristup ako krši neka od pravila iz sekcije 1
- Predložiš DB šemu (sa org_id i RLS od prvog dana)
- Napraviš sve potrebne promjene (backend ruta sa Zod validacijom, frontend 
  komponenta, migracija, test ako je kritična putanja)
- Dodaš unos u AGENTS.md po postojećem obrascu

Počni od DB šeme.
```

---

## 3. BUG FIX — popravka greške

```
Pronašao sam bug: [OPIS]. 

Provjeri:
- Je li ovo finansijske, PDF ili SQL putanje? Ako jeste, 
  **prvo pročitaj** `FINANCIAL_TRUTH_FIELDS.md` i `PAYMENT_CORRECTION_FLOWS.md` 
  (reference su u sekciji 1, pravilo 5)
- Koju sekciju TRAVLINE_IMPROVEMENT_PLAN.md-a doticanje (faze, pravila)?
- Da li je sigurnosni bug (org_id leak, role bypass)? Ako jeste, 
  prioritet je maksimalan, ostalo čeka.

Sada — šta je root cause i kako se popravlja?
```

---

## 4. REFAKTOR/CLEANUP — poboljšanje koda bez novih featurea

```
Želim malo refaktorisati [OPIS]. 

Pogledaj Fazu 1 (sekcija 4) u TRAVLINE_IMPROVEMENT_PLAN.md — to je 
sada moj fokus. Specifično:

- Trebam li pomaći sa migracijama (konsolidacija sql/ foldere)?
- Dead code koji trebam obrisati (public.ts.bak, dupli testovi, reseed scriptovi)?
- Template debris u adminu koji nije potreban?
- npm audit dug (swiper, xlsx)?

Šta preporučuješ kao first step i koliko vremena za sve?
```

---

## 5. SIGURNOSNI/REGULATOR COMPLIANCE — fiskalizacija, multi-tenant, auth

```
Trebam implementirati [FISKALIZACIJA TRŽIŠTA / MULTI-TENANT ONBOARDING 
/ AUTH PROMJENA].

Provjeri sekcije:
- Sekcija 1, posebno pravila 2, 3, 4 (kredencijali, role, org_id, RLS)
- Sekcija 6 (regulatorni zahtjevi po tržištu) ako je fiskalizacija
- Sekcija 7 (Faza 2) ako je onboarding

Prije nego što kodiram:
- Objasni šta je već trenutno pokriveno (search u AGENTS.md)
- Objasni šta nedostaje
- Predloži arhitekturu (apstraktni interfejs za provider-specifične 
  adaptere ako je tržišnu-specifično)
- Identifikuj sve sisteme koji se dotičući (autenticiranje, PDF generisanje, 
  billing?)

Tada — kreni sa DB šemom.
```

---

## 6. EKSPERIMENT/PROOF OF CONCEPT — testiranje nove ideje prije commita

```
Želim testirati ideju: [IDEA].

PoC scoping — provjeri Fazu koja je relevantna u 
TRAVLINE_IMPROVEMENT_PLAN.md (sekcije 5-9):

- Gdje bi logički trebalo da bude?
- Šta su prerequisiti prije nego što ovo može ići u produkciju?
- Koje od pravila iz sekcije 1 bi mogla biti relevantna?

Sad — napravimo PoC koji:
1. **Ne** violira pravila iz sekcije 1 (čak i ako je "samo test")
2. Ima jasno objašnjenje gdje ide nakon PoC-a
3. Može biti lako obrisano ako se ne sviđa, ili evoluira ka pravi implementaciji

Počni sa obzorom šta će biti scope: samo frontend? samo DB? integracija 
sa postojećim rutama?
```

---

## 7. EMERGENCY/URGENT — nešto je hitno, ali pravila i dalje važe

```
!URGENT! [OPIS PROBLEMA].

Čak i ako je hitno:
- Pravila iz sekcije 1 se **ne** skraćuju, posebno:
  - Org_id + RLS nikad se ne preskače (pravilo 4)
  - Finansijske putanje — čitaj FINANCIAL_TRUTH_FIELDS prvo (pravilo 5)
  - Role gating na backendu se ne otkazuje (pravilo 3)
- DB migracije — samo `supabase/migrations/`, nikad `sql/` (pravilo 1)
- Kredencijali se ne commit-uju (pravilo 2)

Šta trebam?
1. Najbrža moguća popravka koja se drži svih pravila
2. Ako je nemoguće — razgovara sa mnom prije nego nego što kodiram

Pocni.
```

---

## 8. DOKUMENTACIJA/KNOWLEDGE UPDATE — kada se šta promijeni

```
Trebam da ažurira dokumentaciju jer se [OPIS PROMJENE].

Gdje bi logički trebalo to da ide?
- AGENTS.md (ako je završena faza/feature — koristi postojeći obrasac)
- TRAVLINE_IMPROVEMENT_PLAN.md (ako mijenja roadmap)
- README ili `/docs/` subfolder (ako je operacionalno ili arhitekturno)

Što trebam?
1. Šta da napravim — gdje ide unos?
2. Kakav format trebam da slijedim?
3. Da li trebam da ažurira nešto drugo (migration docs, sekcija u README)?

Objasni strukturu, daj mi primjer, onda je edituj.
```

---

## 9. CODE REVIEW — "Jesi li siguran da je ovo OK?"

```
Pregledaj ovo što sam ja napisao, ali prvo provjeri:
- Da li narušava neka od pravila iz sekcije 1?
- Da li je u skladu sa fazom u koju je trebalo da ide?
- Šta sam mogao bolje?

Ako je greška — **stop**, ne prihvati to kao gotovo, objasni šta je loše 
i kako trebam da popravim.

Kod je spreman za review.
```

---

## 10. MINIMALNI PROMPT — kad je sve jasno, samo "uradi"

```
[TASK], drži se TRAVLINE_IMPROVEMENT_PLAN.md sekcija 1.
```

(Ovaj prompt radi samo ako je agent već čitao dokument ili ako je task 
toliko jasan da nema neispravne interpretacije.)

---

## Notes za Ismaila

- Svaki prompt počinje sa referencom na dokument — agente upućuje na autentičan izvor, ne na neispravnu memoriju iz drugih konverzacija
- Sekcija 1 se često referencira kao "ograde" — agentima je jasno da su to ne-pregovarljiva pravila, ne "best practices sugestije"
- Feature i bug prompts imaju "šta prvo" — sprječavaju ad-hoc coding bez arhitekture
- Sigurnost (sekcija 5) i regulatorne promjene (sekcija 6) su odvojene jer trebaju drugačiji pristup (arhitektura prvo)
- Emergency prompt (7) **namjerno** pojačava pravila, ne ublažava ih — česta greška je "joj, hitno je, propustimo sigurnosnu provjeru" — ne ovdje

Ako se pojavi scenario koji nije pokrivena ovdje — napiši novi prompt po istom obrascu i dodaj ga u listu.
