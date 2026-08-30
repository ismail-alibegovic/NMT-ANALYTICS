import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Packages from '../pages/admin/Packages';

const getPackages = vi.fn();
const deletePackage = vi.fn();

vi.mock('../api/packages', () => ({
  getPackages: (...args: any[]) => getPackages(...args),
  deletePackage: (...args: any[]) => deletePackage(...args),
}));

vi.mock('../components/packages/PackageEditorModal', () => ({
  default: ({ isOpen, onSaved }: { isOpen: boolean; onSaved: () => void | Promise<void> }) =>
    isOpen ? <button onClick={() => void onSaved()}>modal-save</button> : null,
}));

vi.mock('../components/common/PageMeta', () => ({
  default: () => null,
}));

vi.mock('../components/import/ImportModal', () => ({
  default: () => null,
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1' }, loading: false }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../hooks/useQueryParams', () => ({
  useQueryParams: () => ({ getParam: (_key: string, fallback: string) => fallback, setParams: vi.fn() }),
}));

vi.mock('../hooks/useDataInvalidation', () => ({
  useDataInvalidation: vi.fn(),
}));

vi.mock('../lib/i18n/context', async () => {
  const { en } = await import('../lib/i18n/en');
  return {
    useT: () => ({ lang: 'en', t: en, toggleLang: vi.fn(), setLang: vi.fn() }),
  };
});

vi.mock('../components/ui/PageToolbar', () => ({
  default: ({ createButton }: { createButton?: { label: string; onClick: () => void } }) => (
    <button onClick={createButton?.onClick}>{createButton?.label}</button>
  ),
}));

vi.mock('../components/ui/DataTable', () => ({
  DataTable: ({ data, columns }: { data: unknown[]; columns: Array<{ key: string; render?: (v: unknown, row: unknown) => unknown }> }) => (
    <div>
      {data.map((row: any) => (
        <div key={row.id}>
          {columns.map((column) => (
            <div key={column.key}>{column.render ? (column.render(row[column.key], row) as any) : row[column.key]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
  Pagination: () => null,
}));

vi.mock('../components/ui/EmptyState', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../components/ui/button/Button', () => ({
  default: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
}));

vi.mock('../components/ui/badge/Badge', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return { FileIcon: stub, BoxCubeIcon: stub };
});

describe('Packages page refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({
      data: [{ id: 'pkg-1', name: 'Package 1', destination: 'Istanbul', price: 1000, currency: 'BAM', active: true, created_at: '2026-08-30T10:00:00.000Z' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('refreshes the package list after the editor reports a successful save', async () => {
    render(<MemoryRouter><Packages /></MemoryRouter>);

    await waitFor(() => expect(getPackages).toHaveBeenCalled());
    const initialCallCount = getPackages.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'modal-save' }));

    await waitFor(() => expect(getPackages.mock.calls.length).toBeGreaterThan(initialCallCount));
  });
});
