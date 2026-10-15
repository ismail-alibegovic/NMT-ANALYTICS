import {fireEvent,screen,waitFor} from '@testing-library/react';import {MemoryRouter} from 'react-router';import {beforeEach,describe,expect,it,vi} from 'vitest';
import {render} from './renderWithI18n';import QuotationBookingPanel from '../components/quotations/QuotationBookingPanel';
import {en} from '../lib/i18n/en';import {bs} from '../lib/i18n/bs';import type {Quotation} from '../api/quotations';
const api=vi.hoisted(()=>({options:vi.fn(),book:vi.fn(),get:vi.fn()}));
vi.mock('../api/quotations',()=>({getQuotationBookingOptions:api.options,bookQuotation:api.book,getQuotation:api.get}));
vi.mock('../components/ui/modal',()=>({Modal:({isOpen,children}:any)=>isOpen?<div data-testid="booking-form">{children}</div>:null}));
const quote={id:'quote',status:'accepted',sellTotal:176,currency:'EUR',bookingContext:{source:'itinerary',travelStart:'2027-04-10',travelEnd:'2027-04-15',travelers:2,contactName:'Saved buyer',phone:'+38761111'}} as Quotation;
function show(q=quote){return render(<MemoryRouter><QuotationBookingPanel quotation={q}/></MemoryRouter>);}
beforeEach(()=>{vi.resetAllMocks();localStorage.setItem('travline_lang','en');api.options.mockResolvedValue([{id:'departure',packageName:'Vienna',departAt:'2027-04-10T10:00:00Z',returnAt:'2027-04-15T10:00:00Z'}]);api.book.mockResolvedValue({created:true,reservation:{id:'saved',status:'confirmed'}});});
describe('quotation booking form',()=>{
 for(const [lang,copy]of [['en',en],['bs',bs]] as const){
  it(`uses saved context and fixed prices in ${lang}`,async()=>{
   localStorage.setItem('travline_lang',lang);show();fireEvent.click(screen.getByRole('button',{name:copy.quotations.bookQuote}));
   fireEvent.change(await screen.findByLabelText(copy.quotations.bookingDeparture),{target:{value:'departure'}});
   expect(screen.getByLabelText(copy.quotations.contactName)).toHaveValue('Saved buyer');
   expect(screen.getByText(/176 EUR/)).toBeInTheDocument();
   fireEvent.change(screen.getByLabelText(copy.quotations.bookingNames),{target:{value:'First traveler\nSecond traveler'}});
   fireEvent.submit(screen.getByTestId('booking-form').querySelector('form')!);
   expect(await screen.findByRole('link',{name:copy.quotations.openBooking})).toHaveAttribute('href','/reservations/saved');
   expect(api.book).toHaveBeenCalledWith('quote',expect.objectContaining({departureId:'departure',passengers:[{full_name:'First traveler'},{full_name:'Second traveler'}]}));
   expect(api.book.mock.calls[0][1]).not.toHaveProperty('totalAmount');
  });
 }
 it('blocks mismatched traveler names before sending',async()=>{show();fireEvent.click(screen.getByRole('button',{name:en.quotations.bookQuote}));await screen.findByLabelText(en.quotations.bookingDeparture);
  fireEvent.change(screen.getByLabelText(en.quotations.bookingNames),{target:{value:'Only one'}});
  fireEvent.submit(screen.getByTestId('booking-form').querySelector('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent(en.quotations.bookingNamesMismatch.replace('{count}','2'));expect(api.book).not.toHaveBeenCalled();
 });
 it('shows an existing cancelled booking rather than offering another conversion',()=>{show({...quote,booking:{id:'existing',status:'cancelled',creation_state:'completed'}});expect(screen.getByRole('link',{name:en.quotations.openBooking})).toBeInTheDocument();expect(screen.queryByRole('button',{name:en.quotations.bookQuote})).not.toBeInTheDocument();});
 it('requires review for legacy context',()=>{show({...quote,bookingContext:{}});expect(screen.getByText(en.quotations.bookingReview)).toBeInTheDocument();expect(api.options).not.toHaveBeenCalled();});
 it('keeps entered names and localizes a capacity failure',async()=>{api.book.mockRejectedValue({code:'DEPARTURE_CAPACITY_EXCEEDED'});show();fireEvent.click(screen.getByRole('button',{name:en.quotations.bookQuote}));fireEvent.change(await screen.findByLabelText(en.quotations.bookingDeparture),{target:{value:'departure'}});fireEvent.change(screen.getByLabelText(en.quotations.bookingNames),{target:{value:'One\nTwo'}});fireEvent.submit(screen.getByTestId('booking-form').querySelector('form')!);expect(await screen.findByRole('alert')).toHaveTextContent(en.quotations.bookingCapacity);expect(screen.getByLabelText(en.quotations.bookingNames)).toHaveValue('One\nTwo');});
 it('shows an empty-state explanation when there is no matching departure',async()=>{api.options.mockResolvedValue([]);show();fireEvent.click(screen.getByRole('button',{name:en.quotations.bookQuote}));expect(await screen.findByText(en.quotations.bookingNoDepartures)).toBeInTheDocument();await waitFor(()=>expect(screen.getAllByRole('button',{name:en.quotations.bookQuote})[1]).toBeDisabled());});
});
