import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PackageEditorModal from '../components/packages/PackageEditorModal';

const createPackage = vi.fn();
const updatePackage = vi.fn();
const getHotels = vi.fn();
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
    lang: 'en',
    t: {
      common: {
        cancel: 'Cancel',
        saving: 'Saving…',
        loading: 'Loading…',
      },
      packages: {
        name: 'Name',
        currency: 'Currency',
        tripType: 'Trip type',
        duration: 'Duration (days)',
        isActive: 'Active',
        fieldDescription: 'Description',
        transportType: 'Transport',
        capacity: 'Capacity',
        roomOptions: 'Room options',
        priceModifier: 'Price modifier',
        edit: 'Edit package',
        editor: {
          createTitle: 'New offer / package',
          editTitle: 'Edit offer',
          createAction: 'Create package',
          saveChanges: 'Save changes',
          created: 'Package created.',
          updated: 'Package updated.',
          saveError: 'Failed to save package.',
          requiredFields: 'Name and destination are required.',
          nameLabel: 'Package name *',
          namePlaceholder: 'Paris City Break 7 days',
          destinationLabel: 'Destination *',
          destinationPlaceholder: 'Paris, France',
          basePriceLabel: 'Base price (without options)',
          activeHelp: 'Package is available for sale',
          descriptionPlaceholder: 'Short trip description, included services, etc.',
          transportHelp: 'Transport help',
          transportTypeLabel: 'Transport type',
          transportNone: 'No transport (package only)',
          transportBus: 'Bus',
          transportFlight: 'Flight',
          transportCapacityPlaceholder: 'e.g. 50',
          accommodationTitle: 'Accommodation',
          accommodationHelp: 'Accommodation help',
          accommodationCreateFirst: 'Create first',
          accommodationPersistenceFailed: 'The package was created, but accommodation could not be saved. Fix the issue and save again to retry accommodation without creating a duplicate package.',
          accommodationLoadError: 'Failed to load package accommodation.',
          selectHotelLabel: 'Hotel from catalog',
          selectHotelPlaceholder: 'Select an existing hotel',
          attachHotel: 'Attach hotel',
          removeHotel: 'Remove hotel',
          hotelRequired: 'Select a hotel first.',
          duplicateHotel: 'This hotel is already attached to the package.',
          hotelNotFound: 'Selected hotel was not found in your organization.',
          hotelFallback: 'Linked hotel',
          noHotelDestination: 'No destination',
          invalidPriceModifier: 'Price modifier must be zero or greater.',
          invalidSortOrder: 'Sort order must be zero or greater.',
          sortOrderLabel: 'Sort order',
          roomOptionsHelp: 'Configure reusable room options for this hotel link.',
          addRoomOption: 'Add room option',
          emptyAccommodation: 'No hotels attached yet.',
          emptyRoomOptions: 'No room options yet.',
          roomOptionTypeLabel: 'Type',
          roomOptionLabelLabel: 'Label',
          roomOptionLabelPlaceholder: 'e.g. Double room with balcony',
          roomOptionLabelRequired: 'Each room option must have a label.',
          invalidRoomOptionPrice: 'Room option prices must be zero or greater.',
          invalidRoomOptionAvailability: 'Room option availability must be zero or greater.',
          removeRoomOption: 'Remove room option',
          netPriceLabel: 'Net price',
          sellPriceLabel: 'Sell price',
          availableLabel: 'Available quantity',
          variantsBoundaryHelp: 'Variants are commercial only.',
          variantsTitle: 'Package options',
          addVariant: 'Add option',
          variantsHelp: 'Variants help',
          emptyVariants: 'No options yet.',
          variantTierLabel: 'Tier',
          variantAccommodationLabel: 'Accommodation',
          variantCapacityLabel: 'Cap.',
          removeVariant: 'Remove option',
          roomTypeLabels: {
            single: 'Single',
            double: 'Double',
            triple: 'Triple',
            apartment: 'Apartment',
            studio: 'Studio',
            suite: 'Suite',
          },
        },
      },
    },
    toggleLang: vi.fn(),
    setLang: vi.fn(),
  }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return {
    TrashBinIcon: stub,
    PlusIcon: stub,
    ChevronDownIcon: stub,
  };
});

function getHotelSelect() {
  return screen.getAllByRole('combobox')[3];
}

function getHotelCard(name: string) {
  return screen.getByText(name).closest('.rounded-xl.border') as HTMLElement;
}

describe('PackageEditorModal', () => {
  const initialPackage = {
    id: 'pkg-1',
    name: 'Old package',
    destination: 'Istanbul',
    price: 1000,
    base_price: 1000,
    currency: 'BAM',
    active: true,
    durationDays: 5,
    tripType: 'city',
    transportType: 'none',
    transportCapacity: null,
    created_at: '2026-08-30T10:00:00.000Z',
    variants: [],
  };

  const catalogHotels = [
    { id: 'hotel-1', name: 'Hotel Bosna', destination: 'Sarajevo', stars: 4 },
    { id: 'hotel-2', name: 'Hotel Medine', destination: 'Medina', stars: 5 },
  ];

  const persistedLinks = [
    {
      id: 'link-1',
      packageId: 'pkg-1',
      hotelId: 'hotel-1',
      priceModifier: 25,
      sortOrder: 1,
      createdAt: '2026-08-30T11:00:00.000Z',
      updatedAt: '2026-08-30T11:00:00.000Z',
      hotel: { id: 'hotel-1', name: 'Hotel Bosna', destination: 'Sarajevo', stars: 4 },
      roomOptions: [
        { type: 'double', label: 'Double room', net_price: 80, sell_price: 100, available: 5 },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getHotels.mockResolvedValue(catalogHotels);
    getPackageHotels.mockResolvedValue(persistedLinks);
    updatePackage.mockResolvedValue(initialPackage);
    updatePackageHotel.mockImplementation(async (_id: string, payload: any) => ({
      ...persistedLinks[0],
      ...payload,
    }));
    linkHotelToPackage.mockImplementation(async (_packageId: string, payload: any) => ({
      id: 'link-2',
      packageId: 'pkg-1',
      createdAt: '2026-08-30T12:00:00.000Z',
      updatedAt: '2026-08-30T12:00:00.000Z',
      hotel: catalogHotels.find((hotel) => hotel.id === payload.hotelId),
      ...payload,
    }));
    unlinkHotelFromPackage.mockResolvedValue(undefined);
  });

  it('loads linked hotels when opened and shows persisted room options', async () => {
    render(
      <PackageEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        initial={initialPackage as any}
      />,
    );

    await waitFor(() => expect(getPackageHotels).toHaveBeenCalledWith('pkg-1'));
    expect(await screen.findByText('Hotel Bosna')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Double room')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
  });

  it('loads the hotel catalog in create mode and allows adding a hotel before the package exists', async () => {
    render(
      <PackageEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        initialValues={{ name: 'New package', destination: 'Medina', currency: 'BAM' }}
      />,
    );

    await waitFor(() => expect(getHotels).toHaveBeenCalledTimes(1));
    expect(getPackageHotels).not.toHaveBeenCalled();

    fireEvent.change(getHotelSelect(), { target: { value: 'hotel-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach hotel' }));

    expect(await screen.findByText('Hotel Medine')).toBeInTheDocument();
  });

  it('creates the package first, then persists multiple room options using the returned package id', async () => {
    createPackage.mockResolvedValue({
      id: 'pkg-new',
      name: 'New package',
      destination: 'Medina',
      price: 0,
      currency: 'BAM',
      active: true,
      variants: [],
    });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={onClose}
        onSaved={onSaved}
        initialValues={{ name: 'New package', destination: 'Medina', currency: 'BAM' }}
      />,
    );

    await waitFor(() => expect(getHotels).toHaveBeenCalledTimes(1));
    fireEvent.change(getHotelSelect(), { target: { value: 'hotel-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach hotel' }));

    const medineCard = await screen.findByText('Hotel Medine');
    const hotelCard = medineCard.closest('.rounded-xl.border') as HTMLElement;
    fireEvent.click(within(hotelCard).getByRole('button', { name: 'Add room option' }));
    fireEvent.click(within(hotelCard).getByRole('button', { name: 'Add room option' }));

    const roomTypeSelects = within(hotelCard).getAllByRole('combobox');
    fireEvent.change(roomTypeSelects[roomTypeSelects.length - 2], { target: { value: 'single' } });
    fireEvent.change(roomTypeSelects[roomTypeSelects.length - 1], { target: { value: 'suite' } });

    const roomLabels = within(hotelCard).getAllByPlaceholderText('e.g. Double room with balcony');
    fireEvent.change(roomLabels[0], { target: { value: 'Single room' } });
    fireEvent.change(roomLabels[1], { target: { value: 'Family suite' } });

    const numberInputs = within(hotelCard).getAllByRole('spinbutton');
    fireEvent.change(numberInputs[numberInputs.length - 6], { target: { value: '90' } });
    fireEvent.change(numberInputs[numberInputs.length - 5], { target: { value: '120' } });
    fireEvent.change(numberInputs[numberInputs.length - 4], { target: { value: '4' } });
    fireEvent.change(numberInputs[numberInputs.length - 3], { target: { value: '180' } });
    fireEvent.change(numberInputs[numberInputs.length - 2], { target: { value: '240' } });
    fireEvent.change(numberInputs[numberInputs.length - 1], { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create package' }));

    await waitFor(() => expect(createPackage).toHaveBeenCalledTimes(1));
    expect(linkHotelToPackage).toHaveBeenCalledWith('pkg-new', expect.objectContaining({
      hotelId: 'hotel-2',
      roomOptions: [
        { type: 'single', label: 'Single room', net_price: 90, sell_price: 120, available: 4 },
        { type: 'suite', label: 'Family suite', net_price: 180, sell_price: 240, available: 2 },
      ],
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Package created.');
    expect(toastError).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not create a duplicate package when accommodation persistence fails after create and the user retries', async () => {
    createPackage.mockResolvedValue({
      id: 'pkg-new',
      name: 'New package',
      destination: 'Medina',
      price: 0,
      currency: 'BAM',
      active: true,
      variants: [],
    });
    updatePackage.mockResolvedValue({
      id: 'pkg-new',
      name: 'New package',
      destination: 'Medina',
      price: 0,
      currency: 'BAM',
      active: true,
      variants: [],
    });
    linkHotelToPackage
      .mockRejectedValueOnce(new Error('Hotel link failed'))
      .mockResolvedValueOnce({
        id: 'link-created',
        packageId: 'pkg-new',
        hotelId: 'hotel-2',
        priceModifier: 0,
        sortOrder: 0,
        createdAt: '2026-08-30T12:00:00.000Z',
        updatedAt: '2026-08-30T12:00:00.000Z',
        hotel: { id: 'hotel-2', name: 'Hotel Medine', destination: 'Medina', stars: 5 },
        roomOptions: [
          { type: 'double', label: 'Family suite', net_price: 140, sell_price: 180, available: 3 },
        ],
      });
    getPackageHotels.mockResolvedValue([]);

    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={onClose}
        onSaved={onSaved}
        initialValues={{ name: 'New package', destination: 'Medina', currency: 'BAM' }}
      />,
    );

    await waitFor(() => expect(getHotels).toHaveBeenCalledTimes(1));
    fireEvent.change(getHotelSelect(), { target: { value: 'hotel-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach hotel' }));

    const medineCard = await screen.findByText('Hotel Medine');
    const hotelCard = medineCard.closest('.rounded-xl.border') as HTMLElement;
    fireEvent.click(within(hotelCard).getByRole('button', { name: 'Add room option' }));
    const roomLabels = within(hotelCard).getAllByPlaceholderText('e.g. Double room with balcony');
    fireEvent.change(roomLabels[roomLabels.length - 1], { target: { value: 'Family suite' } });
    const numberInputs = within(hotelCard).getAllByRole('spinbutton');
    fireEvent.change(numberInputs[numberInputs.length - 3], { target: { value: '140' } });
    fireEvent.change(numberInputs[numberInputs.length - 2], { target: { value: '180' } });
    fireEvent.change(numberInputs[numberInputs.length - 1], { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create package' }));

    await waitFor(() => expect(createPackage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('The package was created, but accommodation could not be saved.')));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Create package' }));

    await waitFor(() => expect(updatePackage).toHaveBeenCalledWith('pkg-new', expect.objectContaining({
      name: 'New package',
      destination: 'Medina',
    })));
    expect(createPackage).toHaveBeenCalledTimes(1);
    expect(linkHotelToPackage).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalledWith('Package created.');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows attaching a hotel, editing room options, and saves the canonical payload', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    getPackageHotels
      .mockResolvedValueOnce(persistedLinks)
      .mockResolvedValueOnce([
        persistedLinks[0],
        {
          id: 'link-2',
          packageId: 'pkg-1',
          hotelId: 'hotel-2',
          priceModifier: 60,
          sortOrder: 2,
          createdAt: '2026-08-30T12:00:00.000Z',
          updatedAt: '2026-08-30T12:00:00.000Z',
          hotel: { id: 'hotel-2', name: 'Hotel Medine', destination: 'Medina', stars: 5 },
          roomOptions: [
            { type: 'suite', label: 'Family suite', net_price: 140, sell_price: 180, available: 3 },
          ],
        },
      ]);

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={onClose}
        onSaved={onSaved}
        initial={initialPackage as any}
      />,
    );

    await screen.findByText('Hotel Bosna');

    fireEvent.change(getHotelSelect(), { target: { value: 'hotel-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach hotel' }));

    expect(await screen.findByText('Hotel Medine')).toBeInTheDocument();

    const medineCard = getHotelCard('Hotel Medine');
    fireEvent.click(within(medineCard).getByRole('button', { name: 'Add room option' }));
    const roomLabels = within(medineCard).getAllByPlaceholderText('e.g. Double room with balcony');
    fireEvent.change(roomLabels[roomLabels.length - 1], { target: { value: 'Family suite' } });

    const numberInputs = within(medineCard).getAllByRole('spinbutton');
    fireEvent.change(numberInputs[numberInputs.length - 3], { target: { value: '140' } });
    fireEvent.change(numberInputs[numberInputs.length - 2], { target: { value: '180' } });
    fireEvent.change(numberInputs[numberInputs.length - 1], { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updatePackage).toHaveBeenCalledWith('pkg-1', expect.objectContaining({
      name: 'Old package',
      destination: 'Istanbul',
      transportType: 'none',
    })));

    expect(updatePackageHotel).toHaveBeenCalledWith('link-1', expect.objectContaining({
      hotelId: 'hotel-1',
      roomOptions: [
        { type: 'double', label: 'Double room', net_price: 80, sell_price: 100, available: 5 },
      ],
      priceModifier: 25,
      sortOrder: 1,
    }));

    expect(linkHotelToPackage).toHaveBeenCalledWith('pkg-1', expect.objectContaining({
      hotelId: 'hotel-2',
      roomOptions: [
        { type: 'double', label: 'Family suite', net_price: 140, sell_price: 180, available: 3 },
      ],
    }));

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith('Package updated.');
  });

  it('keeps the modal open and shows an error when linked hotel save fails', async () => {
    linkHotelToPackage.mockRejectedValue(new Error('Hotel link failed'));
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={onClose}
        onSaved={onSaved}
        initial={initialPackage as any}
      />,
    );

    await screen.findByText('Hotel Bosna');
    fireEvent.change(getHotelSelect(), { target: { value: 'hotel-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach hotel' }));
    const medineCard = await screen.findByText('Hotel Medine');
    const hotelCard = medineCard.closest('.rounded-xl.border') as HTMLElement;
    fireEvent.click(within(hotelCard).getByRole('button', { name: 'Add room option' }));
    const roomLabels = within(hotelCard).getAllByPlaceholderText('e.g. Double room with balcony');
    fireEvent.change(roomLabels[roomLabels.length - 1], { target: { value: 'Suite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Hotel link failed'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Edit offer')).toBeInTheDocument();
  });
});
