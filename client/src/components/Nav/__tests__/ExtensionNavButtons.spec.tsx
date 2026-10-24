import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

let mockFeatures = { documentSuite: true, mailerSuite: true, agentCreator: true };

jest.mock('~/hooks/Nav/useExtensionFeatures', () => ({
  __esModule: true,
  default: () => mockFeatures,
}));

jest.mock('@librechat/client', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: React.ComponentProps<'button'> & { asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
  TooltipAnchor: ({ render: trigger }: { render: React.ReactNode }) => trigger,
}));

import ExtensionNavButtons from '../ExtensionNavButtons';

describe('ExtensionNavButtons', () => {
  afterEach(() => {
    mockFeatures = { documentSuite: true, mailerSuite: true, agentCreator: true };
    cleanup();
  });

  it('renders Dateien and Mailer links when enabled', () => {
    render(<ExtensionNavButtons />);
    const docLink = screen.getByTestId('nav-document-processor-button');
    const mailerLink = screen.getByTestId('nav-mailer-button');
    expect(docLink).toHaveAttribute('href', '/dateien/');
    expect(mailerLink).toHaveAttribute('href', '/mailer/');
  });

  it('omits itself when neither extension is enabled', () => {
    mockFeatures = { documentSuite: false, mailerSuite: false, agentCreator: false };
    const { container } = render(<ExtensionNavButtons />);
    expect(container).toBeEmptyDOMElement();
  });
});
