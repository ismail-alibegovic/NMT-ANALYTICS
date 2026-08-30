import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PackageEditorModal from '../components/packages/PackageEditorModal';

const createPackage = vi.fn();
const updatePackage = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../api/packages', () => ({
  createPackage: (...args: any[]) => createPackage(...args),
  updatePackage: (...args: any[]) => updatePackage(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    lang: 'en',
    t: {
      packages: {
        currency: 'Currency',
        tripType: 'Trip type',
        duration: 'Duration (days)',
        isActive: 'Active',
        fieldDescription: 'Description',
        transportType: 'Transport',
        capacity: 'Capacity',
        variants: 'Variants',
        name: 'Name',
        priceModifier: 'Price modifier',
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
          variantsTitle: 'Package options',
          addVariant: 'Add option',
          variantsHelp: 'Variants help',
          emptyVariants: 'No options yet.',
          variantTierLabel: 'Tier',
          variantAccommodationLabel: 'Accommodation',
          variantCapacityLabel: 'Cap.',
          removeVariant: 'Remove option',
        },
      },
      common: {
        cancel: 'Cancel',
        saving: 'Saving…',
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

describe('PackageEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    variants: [
      {
        id: 'variant-1',
        name: 'Standard',
        tier: 'standard',
        accommodation: 'hotel',
        priceModifier: 0,
        capacity: 10,
        currency: 'BAM',
      },
    ],
  };

  it('persists basic fields and canonical transport fields on successful update', async () => {
    updatePackage.mockResolvedValue(initialPackage);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={onClose}
        onSaved={onSaved}
        initial={initialPackage as any}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Short trip description, included services, etc.'), { target: { value: 'Updated description' } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'bus' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 50'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updatePackage).toHaveBeenCalled());

    expect(updatePackage).toHaveBeenCalledWith('pkg-1', expect.objectContaining({
      description: 'Updated description',
      transportType: 'bus',
      transportCapacity: 50,
      tripType: 'city',
      price: 1000,
    }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith('Package updated.');
  });

  it('switching transport to none disables capacity and clears it in the request', async () => {
    updatePackage.mockResolvedValue(initialPackage);

    render(
      <PackageEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        initial={{ ...initialPackage, transportType: 'bus', transportCapacity: 40 } as any}
      />,
    );

    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'none' } });
    expect(screen.getByPlaceholderText('—')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updatePackage).toHaveBeenCalled());
    expect(updatePackage).toHaveBeenCalledWith('pkg-1', expect.objectContaining({
      transportType: 'none',
      transportCapacity: null,
    }));
  });

  it('keeps the modal open and shows an error when save fails', async () => {
    updatePackage.mockRejectedValue(new Error('Transport validation failed'));
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

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Transport validation failed'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Edit offer')).toBeInTheDocument();
  });
});
