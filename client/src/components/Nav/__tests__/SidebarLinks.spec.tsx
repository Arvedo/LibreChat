import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import SidebarLinks from '../SidebarLinks';

let mockStartupConfig: Record<string, unknown> | undefined = {};

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('~/hooks/Nav/useDirection', () => ({
  __esModule: true,
  default: () => 'ltr',
  inlineSide: () => 'right',
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  TooltipAnchor: ({ render: renderNode }: { render: React.ReactNode }) => <>{renderNode}</>,
}));

describe('SidebarLinks', () => {
  beforeEach(() => {
    mockStartupConfig = {};
  });

  it('renders nothing when interface.sidebarLinks is unset or empty', () => {
    const { container } = render(<SidebarLinks />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders configured sidebar links in icon and row layouts', () => {
    mockStartupConfig = {
      interface: {
        sidebarLinks: [
          {
            id: 'docs',
            label: 'Documentation',
            href: '/docs/',
            icon: 'file-text',
            target: '_blank',
          },
          {
            id: 'mail',
            label: 'Mailbox',
            href: 'https://mail.example.com',
            icon: 'mail',
            target: '_self',
          },
        ],
      },
    };

    render(<SidebarLinks />);

    const docsLink = screen.getByTestId('nav-sidebar-link-docs');
    expect(docsLink).toHaveAttribute('href', '/docs/');
    expect(docsLink).toHaveAttribute('target', '_blank');
    expect(docsLink).toHaveAttribute('aria-label', 'Documentation');

    const mailLink = screen.getByTestId('nav-sidebar-link-mail');
    expect(mailLink).toHaveAttribute('href', 'https://mail.example.com');
    expect(mailLink).toHaveAttribute('target', '_self');
  });
});
