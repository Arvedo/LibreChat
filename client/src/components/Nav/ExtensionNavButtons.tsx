import { memo } from 'react';
import { FileText, Mail } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import useExtensionFeatures from '~/hooks/Nav/useExtensionFeatures';
import { cn } from '~/utils';

interface ExtensionNavButtonsProps {
  side?: 'right' | 'bottom';
  onNavigate?: () => void;
  layout?: 'icon' | 'row';
}

function ExtensionNavButtons({
  side = 'right',
  onNavigate,
  layout = 'icon',
}: ExtensionNavButtonsProps) {
  const { documentSuite, mailerSuite } = useExtensionFeatures();

  if (!documentSuite && !mailerSuite) {
    return null;
  }

  const isRow = layout === 'row';

  const items = [
    documentSuite
      ? {
          id: 'doc-processor-nav-btn',
          testId: 'nav-document-processor-button',
          href: '/document-processor/',
          label: 'Document Processor',
          Icon: FileText,
        }
      : null,
    mailerSuite
      ? {
          id: 'mailer-nav-btn',
          testId: 'nav-mailer-button',
          href: '/mailer/',
          label: 'Mailer & Workflow Scheduler',
          Icon: Mail,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <>
      {items.map(({ id, testId, href, label, Icon }) => {
        const button = (
          <Button
            key={id}
            asChild
            variant="nav"
            size={isRow ? 'row' : 'icon'}
            className={cn('shrink-0', isRow ? 'w-full justify-start' : 'h-9 w-9 rounded-lg')}
          >
            <a
              id={id}
              data-testid={testId}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={isRow ? undefined : label}
              onClick={() => onNavigate?.()}
            >
              <Icon className="text-text-primary h-5 w-5 shrink-0" aria-hidden="true" />
              {isRow && (
                <span className="text-text-primary min-w-0 truncate text-sm font-medium">
                  {label}
                </span>
              )}
            </a>
          </Button>
        );

        if (isRow) {
          return button;
        }

        return <TooltipAnchor key={id} side={side} description={label} render={button} />;
      })}
    </>
  );
}

export default memo(ExtensionNavButtons);
