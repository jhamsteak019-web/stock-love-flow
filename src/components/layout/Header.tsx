import { useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from './NotificationBell';
import { BranchSelector } from './BranchSelector';
import { TicketRequestButton } from './TicketRequestButton';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export const Header = ({ onMenuClick, title }: HeaderProps) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    if (refreshing) return;

    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('app:soft-refresh'));
    window.setTimeout(() => {
      setRefreshing(false);
    }, 700);
  };

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur-md transition-all duration-300 supports-[backdrop-filter]:bg-background/60 sm:flex-nowrap sm:px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 truncate text-base font-semibold text-foreground animate-fade-in sm:text-xl">{title}</h1>
        <div className="min-w-0 max-w-full">
          <BranchSelector />
        </div>
      </div>
      
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <TicketRequestButton />
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          title="Refresh"
          className="hover:rotate-180 transition-transform duration-500"
          disabled={refreshing}
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {refreshing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/45 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm font-medium shadow-lg">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Loading...
          </div>
        </div>
      )}
    </header>
  );
};
