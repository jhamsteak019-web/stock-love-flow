import { Menu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6 transition-all duration-300">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-foreground animate-fade-in">{title}</h1>
      </div>
      
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh" className="hover:rotate-180 transition-transform duration-500">
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};
