import { Menu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { BranchSelector } from './BranchSelector';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export const Header = ({ onMenuClick, title }: HeaderProps) => {
  const navigate = useNavigate();
  
  const handleRefresh = () => {
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 px-3 sm:px-4 lg:px-6 transition-all duration-300 gap-2">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden flex-shrink-0"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-base sm:text-xl font-semibold text-foreground animate-fade-in truncate hidden sm:block">{title}</h1>
        <div className="flex-shrink-0">
          <BranchSelector />
        </div>
      </div>
      
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <NotificationBell />
        <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh" className="hover:rotate-180 transition-transform duration-500 h-8 w-8 sm:h-9 sm:w-9">
          <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </header>
  );
};
