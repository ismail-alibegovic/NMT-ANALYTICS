import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('../lib/apiClient', () => ({ post: (...args: unknown[]) => post(...args) }));

import ImportModal from '../components/import/ImportModal';

describe('ImportModal rejected file', () => {
  it('shows the offending rows and reports nothing imported when the API rejects the file', async () => {
    post.mockRejectedValueOnce({
      response: {
        data: {
          code: 'IMPORT_VALIDATION_FAILED',
          results: {
            total: 2,
            invalidCount: 1,
            invalidRows: [{ row: 2, errors: ['email is invalid'] }],
          },
        },
      },
    });
    const onSuccess = vi.fn();
    const { container } = render(
      <ImportModal entity="customers" isOpen onClose={() => {}} onSuccess={onSuccess} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['fullName,phone\nA,061123456'], 'c.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^import/i }));

    await waitFor(() => expect(screen.getByText('Row 2')).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
