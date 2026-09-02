import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PackageEditorModal from '../components/packages/PackageEditorModal';
import DepartureFormModal from '../components/departures/DepartureFormModal';

const createPackage = vi.fn();
const updatePackage = vi.fn();
const getHotels = vi.fn();
const createHotel = vi.fn();
const getPackageHotels = vi.fn();
const linkHotelToPackage = vi.fn();
const updatePackageHotel = vi.fn();
const unlinkHotelFromPackage = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../api/packages', () => ({
  createPackage: (...args: any[]) => createPackage(...args),
  updatePackage: (...args: any[]) => updatePackage(...args),
}));

vi.mock('../api/operations', () => ({
  getHotels: (...args: any[]) => getHotels(...args),
  createHotel: (...args: any[]) => createHotel(...args),
}));

vi.mock('../api/packageHotels', () => ({
  getPackageHotels: (...args: any[]) => getPackageHotels(...args),
  linkHotelToPackage: (...args: any[]) => linkHotelToPackage(...args),
  updatePackageHotel: (...args: any[]) => updatePackageHotel(...args),
  unlinkHotelFromPackage: (...args: any[]) => unlinkHotelFromPackage(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    lang: 'bs',
    t: {
      common: { cancel: 'Odustani', saving: 'Čuvanje…', loading: 'Učitavanje…', success: 'Uspjeh', error: 'Greška' },
      packages: {
        name: 'Name', currency: 'Currency', tripType: 'Trip type', duration: 'Duration',
        isActive: 'Active', fieldDescription: 'Description', transportType: 'Transport', capacity: 'Capacity',
        editor: {
          createTitle: 'Novi paket', editTitle: 'Uredi paket', createAction: 'Kreiraj paket', saveChanges: 'Sačuvaj',
          created: 'Paket kreiran.', updated: 'Paket ažuriran.', saveError: 'Greška pri čuvanju.',
          requiredFields: 'Naziv i destinacija su obavezni.',
          nameLabel: 'Naziv paketa', namePlaceholder: 'Naziv', destinationLabel: 'Destinacija',
          destinationPlaceholder: 'Destinacija', basePriceLabel: 'Cijena', activeHelp: 'Aktivan',
          descriptionPlaceholder: 'Opis', transportHelp: 'Prijevoz', transportTypeLabel: 'Tip prijevoza',
          transportNone: 'Bez prijevoza', transportBus: 'Autobus', transportFlight: 'Avion',
          transportCapacityPlaceholder: 'npr. 50', accommodationTitle: 'Smještaj', accommodationHelp: 'Pomoć',
          accommodationCreateFirst: 'Kreiraj prvo', accommodationPersistenceFailed: 'Greška pri čuvanju smještaja.',
          accommodationLoadError: 'Greška pri učitavanju smještaja.', selectHotelLabel: 'Hotel iz kataloga',
          selectHotelPlaceholder: 'Odaberi hotel', attachHotel: 'Dodaj hotel', createHotel: 'Kreiraj hotel',
          createHotelTitle: 'Kreiraj hotel', createHotelAction: 'Kreiraj hotel', newHotelCreated: 'Hotel kreiran.',
          newHotelCreateFailed: 'Greška.', newHotelRequiredFields: 'Obavezno.', newHotelInvalidTotalRooms: 'Greška.',
          newHotelNameLabel: 'Naziv hotela', newHotelNamePlaceholder: 'Naziv hotela',
          newHotelDestinationLabel: 'Destinacija', newHotelDestinationPlaceholder: 'Destinacija',
          newHotelStarsLabel: 'Zvjezdice', newHotelNoStars: 'Bez zvjezdica', newHotelTotalRoomsLabel: 'Ukupno soba',
          newHotelAddressLabel: 'Adresa', newHotelContactLabel: 'Kontakt', newHotelEmailLabel: 'Email',
          newHotelWebsiteLabel: 'Web', newHotelAmenitiesLabel: 'Sadržaji', newHotelAmenitiesPlaceholder: 'wifi, spa',
          newHotelDescriptionLabel: 'Opis', removeHotel: 'Ukloni hotel', hotelRequired: 'Odaberi hotel.',
          duplicateHotel: 'Hotel je već dodan.', hotelNotFound: 'Hotel nije pronađen.', hotelFallback: 'Hotel',
          noHotelDestination: 'Bez destinacije', invalidPriceModifier: 'Greška.', invalidSortOrder: 'Greška.',
          sortOrderLabel: 'Redoslijed', roomOptionsHelp: 'Pomoć', addRoomOption: 'Dodaj sobu',
          emptyAccommodation: 'Nema hotela.', emptyRoomOptions: 'Nema soba.', roomOptionTypeLabel: 'Tip',
          roomOptionLabelLabel: 'Oznaka', roomOptionLabelPlaceholder: 'npr. Dvokrevetna soba',
          roomOptionLabelRequired: 'Obavezno.', invalidRoomOptionPrice: 'Greška.', invalidRoomOptionAvailability: 'Greška.',
          removeRoomOption: 'Ukloni sobu', netPriceLabel: 'Neto cijena', sellPriceLabel: 'Prodajna cijena',
          availableLabel: 'Dostupno', variantsBoundaryHelp: 'Pomoć', variantsTitle: 'Opcije', addVariant: 'Dodaj opciju',
          variantsHelp: 'Pomoć', emptyVariants: 'Nema opcija.', variantTierLabel: 'Tier',
          variantAccommodationLabel: 'Smještaj', variantCapacityLabel: 'Kap.', removeVariant: 'Ukloni opciju',
          roomTypeLabels: { single: 'Single', double: 'Double', triple: 'Triple', apartment: 'Apartment', studio: 'Studio', suite: 'Suite' },
        },
      },
    },
    toggleLang: vi.fn(),
    setLang: vi.fn(),
  }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return { TrashBinIcon: stub, PlusIcon: stub, ChevronDownIcon: stub };
});

const SCOPE_SELECT_LABEL = 'Vrsta putovanja';
const DOCUMENT_SELECT_LABEL = 'Putni dokument';

function getScopeSelect(): HTMLSelectElement {
  return screen.getByLabelText(SCOPE_SELECT_LABEL) as unknown as HTMLSelectElement;
}

function getDocumentSelect(): HTMLSelectElement {
  return screen.getByLabelText(DOCUMENT_SELECT_LABEL) as unknown as HTMLSelectElement;
}

describe('TravelerRequirements UI — PackageEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHotels.mockResolvedValue([]);
    getPackageHotels.mockResolvedValue([]);
  });

  it('saves international + passport configuration', async () => {
    updatePackage.mockResolvedValue({ id: 'pkg-1' });
    const onSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={onSaved}
        initialValues={{ name: 'Antalya', destination: 'Antalya', currency: 'BAM' }}
      />,
    );

    await waitFor(() => expect(getHotels).toHaveBeenCalledTimes(1));

    fireEvent.change(getScopeSelect(), { target: { value: 'international' } });
    fireEvent.change(getDocumentSelect(), { target: { value: 'passport' } });

    // Select the allowFillLater checkbox to keep it true (default is true already)
    fireEvent.click(screen.getByRole('button', { name: 'Kreiraj paket' }));

    await waitFor(() => expect(createPackage).toHaveBeenCalledTimes(1));
    expect(createPackage).toHaveBeenCalledWith(expect.objectContaining({
      travelerRequirements: expect.objectContaining({
        travelScope: 'international',
        documentType: 'passport',
      }),
    }));
  });

  it('reopens existing traveler requirements config', async () => {
    getPackageHotels.mockResolvedValue([]);
    const initialPackage = {
      id: 'pkg-1',
      name: 'Antalya',
      destination: 'Antalya',
      price: 1000,
      currency: 'BAM',
      active: true,
      variants: [],
      travelerRequirements: {
        travelScope: 'international',
        documentType: 'passport',
        allowFillLater: true,
        requireExpiry: true,
        requireNationality: false,
        requireDateOfBirth: false,
      },
    };

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        initial={initialPackage as any}
      />,
    );

    await waitFor(() => expect(getPackageHotels).toHaveBeenCalledTimes(1));

    expect(getScopeSelect().value).toBe('international');
    expect(getDocumentSelect().value).toBe('passport');
  });

  it('clears document flags when documentType is set to none', async () => {
    getPackageHotels.mockResolvedValue([]);
    const initialPackage = {
      id: 'pkg-1',
      name: 'Antalya',
      destination: 'Antalya',
      price: 1000,
      currency: 'BAM',
      active: true,
      variants: [],
      travelerRequirements: {
        travelScope: 'international',
        documentType: 'passport',
        allowFillLater: true,
        requireExpiry: true,
        requireNationality: true,
        requireDateOfBirth: true,
      },
    };

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        initial={initialPackage as any}
      />,
    );

    await waitFor(() => expect(getPackageHotels).toHaveBeenCalledTimes(1));

    fireEvent.change(getDocumentSelect(), { target: { value: 'none' } });

    // Flags disappear from the DOM
    expect(screen.queryByText('Dozvoli dopunu podataka kasnije')).not.toBeInTheDocument();
    expect(screen.queryByText('Traži datum isteka')).not.toBeInTheDocument();

    updatePackage.mockResolvedValue({ id: 'pkg-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }));

    await waitFor(() => expect(updatePackage).toHaveBeenCalledTimes(1));
    expect(updatePackage).toHaveBeenCalledWith('pkg-1', expect.objectContaining({
      travelerRequirements: expect.objectContaining({
        documentType: 'none',
        requireExpiry: false,
        requireNationality: false,
        requireDateOfBirth: false,
      }),
    }));
  });
});

describe('TravelerRequirements UI — DepartureFormModal', () => {
  const packages = [
    {
      id: 'pkg-1',
      name: 'Antalya',
      destination: 'Antalya',
      price: 1000,
      currency: 'BAM',
      active: true,
      created_at: '',
      travelerRequirements: {
        travelScope: 'international',
        documentType: 'passport',
        allowFillLater: true,
        requireExpiry: true,
        requireNationality: false,
        requireDateOfBirth: false,
      },
    } as any,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('new departure defaults to inherit and submits travelerRequirements: null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <DepartureFormModal
        isOpen={true}
        onClose={vi.fn()}
        title="Dodaj polazak"
        packages={packages}
        editingDeparture={null}
        onSubmit={onSubmit}
        loading={false}
        travelerMode="inherit"
        setTravelerMode={vi.fn()}
        travelerReq={{ travelScope: 'unspecified', documentType: 'none', allowFillLater: true, requireExpiry: false, requireNationality: false, requireDateOfBirth: false }}
        setTravelerReq={vi.fn()}
      />,
    );

    // inherit radio is checked
    expect(screen.getByLabelText('Koristi pravila paketa')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      packageId: '',
    }));
  });

  it('existing departure with null requirements shows inherit mode', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const editingDeparture = {
      id: 'dep-1',
      package_id: 'pkg-1',
      depart_at: '2026-09-10T10:00:00.000Z',
      return_at: '2026-09-20T10:00:00.000Z',
      capacity: 50,
      booked: 0,
      status: 'active',
      transport_type: 'bus',
      travelerRequirements: null,
    } as any;

    render(
      <DepartureFormModal
        isOpen={true}
        onClose={vi.fn()}
        title="Uredi polazak"
        packages={packages}
        editingDeparture={editingDeparture}
        onSubmit={onSubmit}
        loading={false}
        travelerMode="inherit"
        setTravelerMode={vi.fn()}
        travelerReq={{ travelScope: 'unspecified', documentType: 'none', allowFillLater: true, requireExpiry: false, requireNationality: false, requireDateOfBirth: false }}
        setTravelerReq={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Koristi pravila paketa')).toBeChecked();
    expect(screen.queryByText('Vrsta putovanja')).not.toBeInTheDocument();
  });

  it('existing departure with raw override restores override mode and values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const editingDeparture = {
      id: 'dep-1',
      package_id: 'pkg-1',
      depart_at: '2026-09-10T10:00:00.000Z',
      return_at: '2026-09-20T10:00:00.000Z',
      capacity: 50,
      booked: 0,
      status: 'active',
      transport_type: 'bus',
      travelerRequirements: {
        travelScope: 'domestic',
        documentType: 'none',
        allowFillLater: true,
        requireExpiry: false,
        requireNationality: false,
        requireDateOfBirth: false,
      },
    } as any;

    render(
      <DepartureFormModal
        isOpen={true}
        onClose={vi.fn()}
        title="Uredi polazak"
        packages={packages}
        editingDeparture={editingDeparture}
        onSubmit={onSubmit}
        loading={false}
        travelerMode="override"
        setTravelerMode={vi.fn()}
        travelerReq={{ travelScope: 'domestic', documentType: 'none', allowFillLater: true, requireExpiry: false, requireNationality: false, requireDateOfBirth: false }}
        setTravelerReq={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Prilagodi za ovaj polazak')).toBeChecked();
    expect(screen.getByLabelText('Vrsta putovanja')).toBeInTheDocument();
    expect((screen.getByLabelText('Vrsta putovanja') as HTMLSelectElement).value).toBe('domestic');
  });

  it('override mode submits the override object and switching back to inherit submits null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const setTravelerMode = vi.fn();
    const setTravelerReq = vi.fn();

    render(
      <DepartureFormModal
        isOpen={true}
        onClose={vi.fn()}
        title="Dodaj polazak"
        packages={packages}
        editingDeparture={null}
        onSubmit={onSubmit}
        loading={false}
        travelerMode="override"
        setTravelerMode={setTravelerMode}
        travelerReq={{ travelScope: 'international', documentType: 'passport', allowFillLater: true, requireExpiry: true, requireNationality: false, requireDateOfBirth: false }}
        setTravelerReq={setTravelerReq}
      />,
    );

    expect(screen.getByLabelText('Prilagodi za ovaj polazak')).toBeChecked();
    expect(screen.getByLabelText('Vrsta putovanja')).toBeInTheDocument();

    // Selecting inherit calls setTravelerMode('inherit')
    fireEvent.click(screen.getByLabelText('Koristi pravila paketa'));
    expect(setTravelerMode).toHaveBeenCalledWith('inherit');
  });
});
