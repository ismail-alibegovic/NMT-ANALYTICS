import { en } from '../lib/i18n/en';
import { bs } from '../lib/i18n/bs';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from './renderWithI18n';
import Itineraries from '../pages/Itineraries';
import Quotations from '../pages/Quotations';

const api = vi.hoisted(() => ({
  getInquiry: vi.fn(), getInquiries: vi.fn(), getItinerary: vi.fn(), getItineraries: vi.fn(),
  createItinerary: vi.fn(), getQuotations: vi.fn(), createQuotation: vi.fn(),
}));
vi.mock('../api/inquiries', () => ({ getInquiry: api.getInquiry, getInquiries: api.getInquiries }));
vi.mock('../api/itineraries', () => ({ getItinerary: api.getItinerary, getItineraries: api.getItineraries, createItinerary: api.createItinerary }));
vi.mock('../api/quotations', () => ({ getQuotations: api.getQuotations, createQuotation: api.createQuotation }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/ui/PageToolbar', () => ({ default: ({ createButton }: any) => <button onClick={createButton.onClick}>{createButton.label}</button> }));
vi.mock('../components/ui/modal', () => ({ Modal: ({ isOpen, children }: any) => isOpen ? <div data-testid="form">{children}</div> : null }));

function Path() { return <div data-testid="path">{useLocation().search}</div>; }
function show(ui: React.ReactNode, path: string) { return render(<MemoryRouter initialEntries={[path]}>{ui}<Path /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const inquiry = { id: 'inq-1', contactName: 'Pilot Customer', tripType: 'tailor_made', destination: 'Vienna', travelStart: '2027-04-10', travelEnd: '2027-04-15', travelers: 4, currency: 'EUR' };
const itinerary = { id: 'itin-1', title: 'Vienna Plan', currency: 'EUR', currentVersion: 2, versions: [{ id: 'v-old', versionNumber: 1 }, { id: 'v-current', versionNumber: 2 }] };

beforeEach(() => {
  localStorage.setItem('travline_lang', 'en');
  vi.resetAllMocks();
  api.getInquiries.mockResolvedValue([]);
  api.getItineraries.mockResolvedValue([]);
  api.getQuotations.mockResolvedValue([]);
  api.createItinerary.mockResolvedValue({ id: 'created-itinerary' });
  api.createQuotation.mockResolvedValue({ id: 'created-quote' });
});

describe('inquiry handoff', () => {
  it('waits for detail and transfers inquiry fields even when its list is empty', async () => {
    const source = deferred<any>(); api.getInquiry.mockReturnValue(source.promise);
    show(<Itineraries />, '/itineraries?new=1&inquiryId=inq-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading linked source');
    expect(screen.queryByTestId('form')).not.toBeInTheDocument();
    await act(async () => source.resolve(inquiry));
    expect(await screen.findByDisplayValue('Vienna — Pilot Customer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2027-04-10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2027-04-15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
    expect(screen.getByDisplayValue('EUR')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('inq-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create itinerary' }));
    await waitFor(() => expect(api.createItinerary).toHaveBeenCalledWith(expect.objectContaining({ inquiryId: 'inq-1', travelers: 4, currency: 'EUR', destination: 'Vienna' })));
  });

  it('keeps the source link on failure and retries without opening an empty form', async () => {
    api.getInquiry.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(inquiry);
    show(<Itineraries />, '/itineraries?new=1&inquiryId=inq-1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('form')).not.toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('inquiryId=inq-1');
    fireEvent.click(screen.getByRole('button', { name: 'Retry source' }));
    expect(await screen.findByDisplayValue('Vienna — Pilot Customer')).toBeInTheDocument();
  });
});

describe('quotation handoff', () => {
  it('resolves an explicit source version and inherited currency without list version data', async () => {
    api.getItinerary.mockResolvedValue(itinerary);
    show(<Quotations />, '/quotations?new=1&itineraryId=itin-1&versionId=v-old');
    await screen.findByDisplayValue('Offer for: Vienna Plan');
    expect(screen.getByDisplayValue('EUR')).toBeDisabled();
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('itin-1');
    expect(screen.getByText('Source version: v1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() => expect(api.createQuotation).toHaveBeenCalledWith(expect.objectContaining({ itineraryId: 'itin-1', itineraryVersionId: 'v-old', currency: 'EUR' })));
  });

  it('blocks invalid versions and retries the same source', async () => {
    api.getItinerary.mockResolvedValue({ ...itinerary, versions: [] });
    show(<Quotations />, '/quotations?new=1&itineraryId=itin-1&versionId=v-old');
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Create quotation' })).toBeDisabled();
    expect(api.createQuotation).not.toHaveBeenCalled();
    api.getItinerary.mockResolvedValue(itinerary);
    fireEvent.click(screen.getByRole('button', { name: 'Retry source' }));
    await screen.findByDisplayValue('Offer for: Vienna Plan');
    expect(screen.getByRole('button', { name: 'Create quotation' })).toBeEnabled();
  });

  it('uses the current version for list selection and ignores an older async selection', async () => {
    api.getItineraries.mockResolvedValue([{ ...itinerary, versions: [] }, { ...itinerary, id: 'itin-2', title: 'Second Plan', versions: [] }]);
    const old = deferred<any>();
    api.getItinerary.mockImplementation((id: string) => id === 'itin-1' ? old.promise : Promise.resolve({ ...itinerary, id: 'itin-2', title: 'Second Plan' }));
    show(<Quotations />, '/quotations');
    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));
    fireEvent.click(screen.getByRole('button', { name: /From itinerary/ }));
    const select = screen.getAllByRole('combobox')[0];
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3));
    fireEvent.change(select, { target: { value: 'itin-1' } });
    fireEvent.change(select, { target: { value: 'itin-2' } });
    await screen.findByDisplayValue('Offer for: Second Plan');
    await act(async () => old.resolve(itinerary));
    expect(screen.getByDisplayValue('Offer for: Second Plan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() => expect(api.createQuotation).toHaveBeenCalledWith(expect.objectContaining({ itineraryId: 'itin-2', itineraryVersionId: 'v-current' })));
  });
});

// This flow must retain the existing Today translation consumed with replace().
describe('handoff translation compatibility', () => {
  it.each([['en', en], ['bs', bs]] as const)('retains supplier readiness copy in %s', (_lang, locale) => {
    expect(locale.hub.alertSupplierConfirmations.replace('{count}', '2')).toContain('2');
  });
});
