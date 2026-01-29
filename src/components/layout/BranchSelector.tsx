import { ChevronDown, Building2 } from 'lucide-react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const BranchSelector = () => {
  const { branches, selectedBranch, setSelectedBranch, loading } = useBranch();
  const { userRole } = useAuth();
  // Admin and HR can switch branches
  const canSwitchBranch = userRole === 'admin' || userRole === 'hr';

  if (loading) {
    return (
      <div className="h-9 w-32 bg-muted animate-pulse rounded-md" />
    );
  }

  if (branches.length === 0) {
    return null;
  }

  // Non-admins and non-HR see a read-only badge showing their assigned branch
  if (!canSwitchBranch) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-muted/50 border border-border">
        <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
        <span className="font-medium text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[150px]">
          {selectedBranch?.name || 'No Branch'}
        </span>
      </div>
    );
  }

  // Admins can change the branch
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="gap-1.5 sm:gap-2 min-w-[100px] sm:min-w-[140px] justify-between bg-background border-primary/20 hover:border-primary/40 hover:bg-primary/5 h-8 sm:h-9 px-2 sm:px-3"
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
            <span className="font-medium truncate max-w-[60px] sm:max-w-[120px] text-xs sm:text-sm">
              {selectedBranch?.name || 'Select'}
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-50 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px] bg-popover z-50">
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => setSelectedBranch(branch)}
            className={cn(
              "cursor-pointer",
              selectedBranch?.id === branch.id && "bg-primary/10 text-primary font-medium"
            )}
          >
            <Building2 className="h-4 w-4 mr-2" />
            {branch.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
