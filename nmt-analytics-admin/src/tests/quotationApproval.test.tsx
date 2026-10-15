import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from './renderWithI18n';
import QuotationDetail from '../pages/QuotationDetail';
import { en } from '../lib/i18n/en';
import { bs } from '../lib/i18n/bs';

const api = vi.hoisted(() => ({
  getQuotation: vi.fn(), updateQuotation: vi.fn(), addQuotationItem: vi.fn(),
  editQuotationItem: vi.fn(), deleteQuotationItem: vi.fn(), error: vi.fn(),
}));
vi.mock('../api/quotations', () => ({
  getQuotation: api.getQuotation, updateQuotation: api.updateQuotation,
  addQuotationItem: api.addQuotationItem, editQuotationItem: api.editQuotationItem,
  deleteQuotationItem: api.deleteQuotationItem, quotationPdfUrl: () => '/pdf',
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({success: vi.fn(), error: api.error}) }));
vi.mock('../components/common/PageMeta', () => ({default: () => null}));
vi.mock('../components/ui/modal', () => ({Modal: ({isOpen, children}: any) => isOpen ? <div>{children}</div> : null}));
const item = {
  id: 'item', title: 'Approved transfer', dayNumber: 1, currency: 'EUR',
  quantity: 1, netUnitPrice: 100, markupPercent: 10, netLineTotal: 100, sellLineTotal: 110,
  category: 'transport', unit: 'fixed', included: true,
};
const quote = {
  id: 'quote', title: 'Vienna offer', reference: 'QTN-test', itineraryId: null,
  status: 'draft', acceptedAt: null, commercialLocked: false, currency: 'EUR',
  markupStrategy: 'per_item', globalMarkupPercent: 0, netTotal: 100, sellTotal: 110, marginTotal: 10,
  items: [item],
};
function show() {
  return render(<MemoryRouter initialEntries={['/quotations/quote']}><Routes>
    <Route path="/quotations/:id" element={<QuotationDetail />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { vi.resetAllMocks(); localStorage.setItem('travline_lang', 'en'); api.getQuotation.mockResolvedValue({...quote}); });

describe('quotation approval UI', () => {
  for (const [lang, copy] of [['en', en], ['bs', bs]] as const) {
    it(`shows immutable terms and no item controls in ${lang}`, async () => {
      localStorage.setItem('travline_lang', lang);
      api.getQuotation.mockResolvedValue({...quote, status:'accepted', acceptedAt:'2026-10-14T12:00:00Z', commercialLocked:true});
      show();
      expect(await screen.findByRole('status')).toHaveTextContent(copy.quotations.acceptedLocked);
      expect(screen.getByText(item.title)).toBeInTheDocument();
      expect(screen.queryByRole('button', {name:copy.quotations.addItem})).not.toBeInTheDocument();
      expect(screen.queryByRole('button', {name:copy.quotations.editItem})).not.toBeInTheDocument();
      expect(screen.queryByRole('button', {name:copy.quotations.deleteItem})).not.toBeInTheDocument();
    });
  }
  it('retains locked behavior for a legacy accepted quote subsequently rejected', async () => {
    api.getQuotation.mockResolvedValue({...quote, status:'rejected', acceptedAt:null, commercialLocked:true});
    show();
    expect(await screen.findByRole('status')).toHaveTextContent(en.quotations.acceptedLocked);
    expect(screen.queryByRole('button', {name:en.quotations.editItem})).not.toBeInTheDocument();
  });
  it('reloads complete quotation items after each status change', async () => {
    let current = {...quote};
    api.getQuotation.mockImplementation(async () => current);
    api.updateQuotation.mockImplementation(async (_id, {status}) => {
      current = {...current, status, commercialLocked:status==='accepted'};
      const {items: _items, ...header} = current;
      return header;
    });
    show();
    fireEvent.click(await screen.findByRole('button', {name:en.quotations.markSent}));
    fireEvent.click(await screen.findByRole('button', {name:en.quotations.markAccepted}));
    expect(await screen.findByRole('status')).toHaveTextContent(en.quotations.acceptedLocked);
    expect(screen.getByText(item.title)).toBeInTheDocument();
    expect(api.getQuotation).toHaveBeenCalledTimes(3);
  });
  it('localizes a failed acceptance rather than displaying the server message', async () => {
    localStorage.setItem('travline_lang', 'bs');
    api.getQuotation.mockResolvedValue({...quote, status:'sent'});
    api.updateQuotation.mockRejectedValue({code:'QUOTATION_INVALID_PRICING', message:'Server English'});
    show();
    fireEvent.click(await screen.findByRole('button', {name:bs.quotations.markAccepted}));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(bs.quotations.acceptancePricingError));
    expect(screen.getByText(item.title)).toBeInTheDocument();
  });
});

describe('saved booking context',()=>{
  for(const [lang,copy]of [['en',en],['bs',bs]] as const){
    it(`shows the saved source rather than later itinerary changes in ${lang}`,async()=>{
      localStorage.setItem('travline_lang',lang);
      api.getQuotation.mockResolvedValue({...quote,itineraryId:'itinerary',itinerary:{title:'Changed live plan'},
        bookingContext:{source:'itinerary',itineraryTitle:'Original plan',contactName:'Original client',destination:'Vienna',travelStart:'2027-04-10',travelEnd:'2027-04-15',travelers:4}});
      show();
      expect(await screen.findByText(copy.quotations.bookingContextTitle)).toBeInTheDocument();
      expect(screen.getByRole('link',{name:'Original plan'})).toBeInTheDocument();
      expect(screen.queryByText('Changed live plan')).not.toBeInTheDocument();
      expect(screen.getByText('Original client')).toBeInTheDocument();
      expect(screen.getByText('2027-04-10 – 2027-04-15')).toBeInTheDocument();
    });
  }
});
