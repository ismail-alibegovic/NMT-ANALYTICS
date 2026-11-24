import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import { bs } from '../lib/i18n/bs';
import { en } from '../lib/i18n/en';

const h = vi.hoisted(() => ({
  stableUser: { id: 'user-1', email: 'director@agency.test' },
  getPaymentDashboard: vi.fn(),
  getPaymentStatusDistribution: vi.fn(),
  getPayments: vi.fn(),
  getTransactions: vi.fn(),
  getReceipts: vi.fn(),
  createReceipt: vi.fn(),
  getContracts: vi.fn(),
  createContract: vi.fn(),
  getReservations: vi.fn(),
  getDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    user: h.stableUser,
    loading: false,
    userContext: { role: 'director', user: { email: 'director@agency.test' }, org: { id: 'org-1', name: 'Synthetic Agency' } },
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: h.toastSuccess,
    error: h.toastError,
    showSuccess: h.toastSuccess,
    showError: h.toastError,
  }),
}));

vi.mock('../api/payments', () => ({
  getPaymentDashboard: (...args: unknown[]) => h.getPaymentDashboard(...args),
  getPayments: (...args: unknown[]) => h.getPayments(...args),
}));

vi.mock('../api/analytics', () => ({
  getPaymentStatusDistribution: (...args: unknown[]) => h.getPaymentStatusDistribution(...args),
}));

vi.mock('../api/transactions', () => ({
  getTransactions: (...args: unknown[]) => h.getTransactions(...args),
}));

vi.mock('../api/receipts', () => ({
  getReceipts: (...args: unknown[]) => h.getReceipts(...args),
  createReceipt: (...args: unknown[]) => h.createReceipt(...args),
  refundReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  downloadReceiptPDF: vi.fn(),
}));

vi.mock('../api/contracts', () => ({
  getContracts: (...args: unknown[]) => h.getContracts(...args),
  createContract: (...args: unknown[]) => h.createContract(...args),
  updateContract: vi.fn(),
  deleteContract: vi.fn(),
  downloadContractPDF: vi.fn(),
}));

vi.mock('../api/reservations', () => ({
  getReservations: (...args: unknown[]) => h.getReservations(...args),
}));

vi.mock('../api/documents', () => ({
  getDocuments: (...args: unknown[]) => h.getDocuments(...args),
  uploadDocument: (...args: unknown[]) => h.uploadDocument(...args),
  downloadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('../lib/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => h.apiGet(...args),
    put: (...args: unknown[]) => h.apiPut(...args),
    post: vi.fn(),
  },
}));

vi.mock('../components/charts/DonutChart', () => ({
  default: ({ title, labels }: { title: string; labels: string[] }) => (
    <div data-testid="donut-chart">
      <span>{title}</span>
      <span>{labels.join(',')}</span>
    </div>
  ),
}));

vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/common/PageBreadCrumb', () => ({ default: ({ pageTitle }: { pageTitle: string }) => <div>{pageTitle}</div> }));
vi.mock('../icons', () => ({
  DollarLineIcon: () => null,
  BoxIconLine: () => null,
  ArrowDownIcon: () => null,
  AlertIcon: () => null,
  DownloadIcon: () => null,
  TrashBinIcon: () => null,
  PlusIcon: () => null,
  ArrowRightIcon: () => null,
  CheckLineIcon: () => null,
  FileIcon: () => null,
  DocsIcon: () => null,
  PageIcon: () => null,
  SearchIcon: () => null,
}));

import UnifiedPayments from '../pages/admin/UnifiedPayments';
import Receipts from '../pages/operations/Receipts';
import Contracts from '../pages/operations/Contracts';
import Documents from '../pages/admin/Documents';
import PdfTemplateEditor from '../pages/admin/PdfTemplateEditor';

beforeEach(() => {
  localStorage.clear();
  h.getPaymentDashboard.mockReset();
  h.getPaymentStatusDistribution.mockReset();
  h.getPayments.mockReset();
  h.getTransactions.mockReset();
  h.getReceipts.mockReset();
  h.createReceipt.mockReset();
  h.getContracts.mockReset();
  h.createContract.mockReset();
  h.getReservations.mockReset();
  h.getDocuments.mockReset();
  h.uploadDocument.mockReset();
  h.apiGet.mockReset();
  h.apiPut.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Finance & Documents BS/EN localization and fail-closed recovery', () => {
  it.each(['bs', 'en'] as const)('UnifiedPayments fails closed on dashboard/payments/tx errors, recovers on retry, and renders locale formatting (%s)', async (lang) => {
    const t = lang === 'bs' ? bs : en;
    const u = t.payments.unified;
    localStorage.setItem('travline_lang', lang);

    h.getPaymentDashboard.mockRejectedValueOnce(new Error('PRIVATE_DASH_ERR'));
    h.getPaymentDashboard.mockResolvedValueOnce({
      metrics: { totalPaidToday: 120, totalPaidThisMonth: 500, overdueAmount: 80, overdueCount: 1, totalPendingAmount: 40, pendingCount: 1 },
      overdueReservations: [{ customerName: 'Test Guest', customerPhone: '+38761000001', packageName: 'Mostar', departureDate: '2026-10-15T00:00:00Z', balanceDue: 80, paymentStatus: 'unpaid', currency: 'BAM' }],
      pendingPayments: [],
      recentPayments: [],
    });
    h.getPaymentStatusDistribution.mockResolvedValue({ breakdown: { succeeded: { total: 500, count: 2 } } });
    h.getPayments.mockRejectedValueOnce(new Error('PRIVATE_PAY_ERR'));
    h.getPayments.mockResolvedValueOnce({ data: [], pagination: { total: 0 } });
    h.getTransactions.mockRejectedValueOnce(new Error('PRIVATE_TX_ERR'));
    h.getTransactions.mockResolvedValueOnce({ data: [{ id: 'tx-12345678', type: 'refund', amount: 50, currency: 'BAM', note: 'Refund note', occurred_at: '2026-10-12T00:00:00Z' }], total: 1 });

    render(<MemoryRouter><I18nProvider><UnifiedPayments /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(u.dashboardLoadError);
    expect(screen.queryByText('PRIVATE_DASH_ERR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: u.retry }));
    expect(await screen.findByText('Test Guest')).toBeInTheDocument();
    expect(screen.getByText(u.statuses.unpaid)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: u.tabs.payments }));
    expect(await screen.findByRole('alert')).toHaveTextContent(u.paymentsLoadError);
    fireEvent.click(screen.getByRole('button', { name: u.retry }));
    expect(await screen.findByText(t.payments.noPayments)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: u.tabs.transactions }));
    expect(await screen.findByRole('alert')).toHaveTextContent(u.transactionsLoadError);
    fireEvent.click(screen.getByRole('button', { name: u.retry }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText(u.txTypes.refund)).toBeInTheDocument();
  });

  it('Receipts fails closed on read error, retries cleanly, and re-localizes validation alert live on BS <-> EN', async () => {
    localStorage.setItem('travline_lang', 'bs');
    h.getReceipts.mockRejectedValueOnce(new Error('PRIVATE_RECEIPTS_ERR'));
    h.getReceipts.mockResolvedValueOnce({
      data: [{ id: 'rec-1', receiptNumber: 'FR-2026-0001', travelerName: 'Amina Putnik', receiptType: 'final', amount: 250, paymentMethod: 'bank', issuedAt: '2026-10-15T10:00:00Z' }],
      total: 1,
    });
    h.getReservations.mockResolvedValue({ data: [] });

    render(<MemoryRouter><I18nProvider><LanguageToggleButton /><Receipts /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(bs.operations.receipts.loadError);
    expect(screen.queryByText('PRIVATE_RECEIPTS_ERR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: bs.operations.receipts.retry }));
    expect(await screen.findByText('FR-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${bs.operations.receipts.downloadPdfLabel} FR-2026-0001` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: bs.operations.receipts.add }));
    fireEvent.click(screen.getByRole('button', { name: bs.operations.receipts.issueAction }));
    expect(await screen.findByRole('alert')).toHaveTextContent(bs.operations.receipts.selectReservation);

    fireEvent.click(screen.getByRole('button', { name: bs.common.switchToEnglish }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.operations.receipts.selectReservation);
  });

  it.each(['bs', 'en'] as const)('Contracts fails closed on read error, retries cleanly, and renders localized badges & actions (%s)', async (lang) => {
    const tr = (lang === 'bs' ? bs : en).operations.contracts;
    localStorage.setItem('travline_lang', lang);

    h.getContracts.mockRejectedValueOnce(new Error('PRIVATE_CONTRACTS_ERR'));
    h.getContracts.mockResolvedValueOnce({
      data: [{ id: 'con-1', contractNumber: 'UG-2026-0001', travelerName: 'Emir Putnik', packageDescription: 'Istanbul', totalAmount: 900, contractDate: '2026-10-15T10:00:00Z', status: 'draft' }],
      total: 1,
    });

    render(<MemoryRouter><I18nProvider><Contracts /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(tr.loadError);
    expect(screen.queryByText('PRIVATE_CONTRACTS_ERR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: tr.retry }));
    expect(await screen.findByText('UG-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${tr.signLabel} UG-2026-0001` })).toBeInTheDocument();
  });

  it('Documents fails closed on read error, retries, localizes banner/actors, and re-localizes failed upload alert without raw error leak', async () => {
    localStorage.setItem('travline_lang', 'bs');
    h.getDocuments.mockRejectedValueOnce(new Error('PRIVATE_DOCS_ERR'));
    h.getDocuments.mockResolvedValueOnce({
      data: [{ id: 'doc-1', name: 'voucher.pdf', type: 'application/pdf', size: 2048, created_at: '2026-10-15T10:00:00Z', profiles: null }],
      total: 1,
    });

    const { container } = render(<MemoryRouter><I18nProvider><LanguageToggleButton /><Documents /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(bs.documents.loadError);
    expect(screen.queryByText('PRIVATE_DOCS_ERR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: bs.documents.retry }));
    expect(await screen.findByText('voucher.pdf')).toBeInTheDocument();
    expect(screen.getByText(bs.documents.systemActor)).toBeInTheDocument();
    expect(screen.getByText(bs.documents.templatesBannerTitle)).toBeInTheDocument();

    h.uploadDocument.mockRejectedValueOnce(new Error('RAW_STORAGE_UPLOAD_ERR'));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF'], 'broken.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(bs.documents.uploadError);
    expect(screen.queryByText('RAW_STORAGE_UPLOAD_ERR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: bs.common.switchToEnglish }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.documents.uploadError);
    expect(screen.getByText(en.documents.templatesBannerTitle)).toBeInTheDocument();
  });

  it.each(['bs', 'en'] as const)('PdfTemplateEditor localizes block style and action controls in %s', async (lang) => {
    const t = lang === 'bs' ? bs : en;
    localStorage.setItem('travline_lang', lang);
    h.apiGet.mockResolvedValueOnce({ data: { pdf_template_config: {} } });

    render(<MemoryRouter><I18nProvider><PdfTemplateEditor /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: t.settings.pdfTemplates })).toBeInTheDocument();
    expect(screen.getAllByLabelText(t.settings.blockLabel).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(t.settings.moveUp).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: t.settings.alignCenter }).length).toBeGreaterThan(0);
  });
});
