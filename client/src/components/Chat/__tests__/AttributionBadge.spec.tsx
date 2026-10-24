import React from 'react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import AttributionBadge from '../AttributionBadge';

let mockStartupConfig: Record<string, unknown> | undefined;
let mockMaximizeChatSpace = false;

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => mockMaximizeChatSpace,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    maximizeChatSpace: {},
  },
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) => {
    if (key === 'com_ui_attribution_powered_by_partner') {
      return `Powered by ${values?.anchor} and ${values?.partner}`;
    }
    if (key === 'com_ui_attribution_powered_by_others') {
      return `Powered by ${values?.anchor} and others`;
    }
    if (key === 'com_ui_attribution_powered_by') {
      return `Powered by ${values?.anchor}`;
    }
    return key;
  },
}));

jest.mock('../LicensesModal', () => ({
  __esModule: true,
  default: ({ open, licensesUrl }: { open: boolean; licensesUrl?: string }) =>
    open ? <div data-testid="licenses-modal" data-url={licensesUrl ?? '/licenses.json'} /> : null,
}));

describe('AttributionBadge', () => {
  beforeEach(() => {
    mockStartupConfig = undefined;
    mockMaximizeChatSpace = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when attribution is not configured or disabled', () => {
    const { container, rerender } = render(<AttributionBadge />);
    expect(container).toBeEmptyDOMElement();

    mockStartupConfig = {
      interface: {
        attribution: { enabled: false, anchor: 'ModelA' },
      },
    };
    rerender(<AttributionBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when maximizeChatSpace is active', () => {
    mockMaximizeChatSpace = true;
    mockStartupConfig = {
      interface: {
        attribution: { enabled: true, anchor: 'ModelA' },
      },
    };
    const { container } = render(<AttributionBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders partner, others, or standalone variants based on random selection and opens modal on click', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockStartupConfig = {
      interface: {
        attribution: {
          enabled: true,
          anchor: 'ModelA',
          partners: ['PartnerB'],
          includeOthers: true,
          includeStandalone: true,
          licensesUrl: '/custom-licenses.json',
        },
      },
    };

    const user = userEvent.setup();
    render(<AttributionBadge />);

    const badge = screen.getByTestId('attribution-badge');
    expect(badge).toHaveTextContent('Powered by ModelA and PartnerB');

    await user.click(badge);
    const modal = screen.getByTestId('licenses-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('data-url', '/custom-licenses.json');
  });

  it('renders the others variant when selected', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.45);
    mockStartupConfig = {
      interface: {
        attribution: {
          enabled: true,
          anchor: 'ModelA',
          partners: ['PartnerB'],
          includeOthers: true,
          includeStandalone: true,
        },
      },
    };

    render(<AttributionBadge />);
    expect(screen.getByTestId('attribution-badge')).toHaveTextContent(
      'Powered by ModelA and others',
    );
  });

  it('renders the standalone variant when selected', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.95);
    mockStartupConfig = {
      interface: {
        attribution: {
          enabled: true,
          anchor: 'ModelA',
          partners: ['PartnerB'],
          includeOthers: true,
          includeStandalone: true,
        },
      },
    };

    render(<AttributionBadge />);
    expect(screen.getByTestId('attribution-badge')).toHaveTextContent('Powered by ModelA');
  });
});
