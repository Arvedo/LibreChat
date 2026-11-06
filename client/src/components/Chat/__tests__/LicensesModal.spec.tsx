import React from 'react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LicensesModal from '../LicensesModal';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: jest.fn(() => true),
}));

function renderModal(props: React.ComponentProps<typeof LicensesModal>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LicensesModal {...props} />
    </QueryClientProvider>,
  );
}

describe('LicensesModal', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches and displays license entries sorted by prominent flag, supports search and category filtering, and expands license text', async () => {
    const payload = {
      entries: [
        {
          id: 'lib-secondary',
          name: 'SecondaryLib',
          version: '1.2.0',
          license: 'MIT',
          category: 'Backend',
          url: 'https://example.org/secondary',
          notice: 'Secondary library notice',
          prominent: false,
        },
        {
          id: 'model-primary',
          name: 'PrimaryModel',
          version: '2.5',
          license: 'Apache-2.0',
          category: 'AI Models',
          url: 'javascript:alert(1)',
          copyright: 'Copyright Example Corp',
          licenseText: 'Full Apache-2.0 license text here',
          prominent: true,
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (header: string) =>
          header.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null,
      },
      json: async () => payload,
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    renderModal({ open: true, onOpenChange: jest.fn() });

    await waitFor(() => {
      expect(screen.getAllByTestId('license-card')).toHaveLength(2);
    });

    const cards = screen.getAllByTestId('license-card');
    expect(cards[0]).toHaveTextContent('PrimaryModel');
    expect(cards[1]).toHaveTextContent('SecondaryLib');

    // Unsafe javascript: URL is not rendered as a link
    expect(screen.queryByRole('link', { name: 'PrimaryModel' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SecondaryLib' })).toHaveAttribute(
      'href',
      'https://example.org/secondary',
    );

    // Expand license text
    await user.click(
      screen.getByRole('button', { name: /com_ui_open_source_licenses_show_text/i }),
    );
    expect(screen.getByText('Full Apache-2.0 license text here')).toBeInTheDocument();

    // Filter by category
    await user.click(screen.getByRole('button', { name: 'Backend' }));
    expect(screen.getAllByTestId('license-card')).toHaveLength(1);
    expect(screen.getByText('SecondaryLib')).toBeInTheDocument();

    // Reset category and filter by search input
    await user.click(screen.getByRole('button', { name: 'com_ui_open_source_licenses_all' }));
    const searchInput = screen.getByRole('searchbox', {
      name: 'com_ui_open_source_licenses_search',
    });
    await user.type(searchInput, 'PrimaryModel');
    expect(screen.getAllByTestId('license-card')).toHaveLength(1);
    expect(screen.getByText('PrimaryModel')).toBeInTheDocument();
  });

  it('shows the empty state when the server returns an HTML fallback instead of JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'text/html; charset=utf-8',
      },
      json: async () => ({}),
    }) as unknown as typeof fetch;

    renderModal({ open: true, onOpenChange: jest.fn() });

    expect(await screen.findByText('com_ui_open_source_licenses_empty')).toBeInTheDocument();
  });

  it('falls back to /licenses.json for unsafe licensesUrl and filters out malformed entries', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        entries: [
          null,
          { name: '', license: 'MIT' },
          { name: 'ValidComponent', license: 'BSD-3-Clause' },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal({
      open: true,
      onOpenChange: jest.fn(),
      licensesUrl: '//evil.example/licenses.json',
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('license-card')).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith('/licenses.json', {
      headers: { Accept: 'application/json' },
    });
    expect(screen.getByText('ValidComponent')).toBeInTheDocument();
  });
});
