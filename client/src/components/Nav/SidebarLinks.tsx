import { memo } from 'react';
import {
  FileText,
  Files,
  Folder,
  Mail,
  Globe,
  ExternalLink,
  BookOpen,
  Database,
  Terminal,
  Wrench,
  Calendar,
  BarChart3,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import type { TSidebarLinkIcon } from 'librechat-data-provider';
import type { ComponentType } from 'react';
import useDirection, { inlineSide } from '~/hooks/Nav/useDirection';
import { useGetStartupConfig } from '~/data-provider';
import { cn } from '~/utils';

const ICON_MAP: Record<TSidebarLinkIcon, ComponentType<{ className?: string }>> = {
  'file-text': FileText,
  files: Files,
  folder: Folder,
  mail: Mail,
  globe: Globe,
  'external-link': ExternalLink,
  'book-open': BookOpen,
  database: Database,
  terminal: Terminal,
  wrench: Wrench,
  calendar: Calendar,
  'chart-bar': BarChart3,
  shield: Shield,
  sparkles: Sparkles,
};

interface SidebarLinksProps {
  side?: 'right' | 'left' | 'bottom';
  onNavigate?: () => void;
  layout?: 'icon' | 'row';
}

function SidebarLinks({ side, onNavigate, layout = 'icon' }: SidebarLinksProps) {
  const { data: startupConfig } = useGetStartupConfig();
  const defaultSide = inlineSide(useDirection(), 'end');
  const tooltipSide = side ?? defaultSide;
  const links = startupConfig?.interface?.sidebarLinks;

  if (!Array.isArray(links) || links.length === 0) {
    return null;
  }

  const isRow = layout === 'row';

  return (
    <>
      {links.map((item, idx) => {
        if (!item?.href || !item?.label) {
          return null;
        }
        const slug =
          item.id ||
          item.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') ||
          String(idx);
        const Icon = ICON_MAP[item.icon ?? 'external-link'] ?? ExternalLink;
        const target = item.target ?? '_blank';
        const button = (
          <Button
            key={slug}
            asChild
            variant="nav"
            size={isRow ? 'row' : 'icon'}
            className={cn('shrink-0', isRow ? 'w-full justify-start' : 'h-9 w-9 rounded-lg')}
          >
            <a
              id={`sidebar-link-${slug}`}
              data-testid={`nav-sidebar-link-${slug}`}
              href={item.href}
              target={target}
              rel={target === '_blank' ? 'noopener noreferrer' : undefined}
              aria-label={isRow ? undefined : item.label}
              onClick={() => onNavigate?.()}
            >
              <Icon className="text-text-primary h-5 w-5 shrink-0" aria-hidden="true" />
              {isRow && (
                <span className="text-text-primary min-w-0 truncate text-sm font-medium">
                  {item.label}
                </span>
              )}
            </a>
          </Button>
        );

        if (isRow) {
          return button;
        }

        return <TooltipAnchor key={slug} side={tooltipSide} description={item.label} render={button} />;
      })}
    </>
  );
}

export default memo(SidebarLinks);
