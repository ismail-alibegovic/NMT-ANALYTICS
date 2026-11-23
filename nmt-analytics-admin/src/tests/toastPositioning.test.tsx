import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../context/ToastContext';

const capturedToasterProps: Array<{
  position?: string;
  containerStyle?: { zIndex?: number };
}> = [];

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  });

  return {
    default: toast,
    Toaster: (props: { position?: string; containerStyle?: { zIndex?: number } }) => {
      capturedToasterProps.push(props);
      return <div data-testid="mock-toaster" data-position={props.position} />;
    },
  };
});

describe('ToastProvider positioning', () => {
  beforeEach(() => {
    capturedToasterProps.length = 0;
  });

  it('positions toasts bottom-right above the header and modal stacking layer', () => {
    render(
      <ToastProvider>
        <div>App content</div>
      </ToastProvider>,
    );

    expect(capturedToasterProps).toHaveLength(1);
    expect(capturedToasterProps[0]?.position).toBe('bottom-right');
    expect(capturedToasterProps[0]?.containerStyle?.zIndex).toBeGreaterThanOrEqual(100000);
  });
});
