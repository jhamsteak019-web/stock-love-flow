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
      <div className="h-9 w-32 max-w-full bg-muted animate-pulse rounded-md" />
    );
  }

  if (branches.length === 0) {
    return null;
  }

  // Non-admins and non-HR see a read-only badge showing their assigned branch
  if (!canSwitchBranch) {
    return (
      <div className="flex max-w-[calc(100vw-7rem)] items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 sm:max-w-none">
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium">
          {selectedBranch?.name || 'No Branch Assigned'}
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
          className="min-w-0 max-w-[calc(100vw-7rem)] justify-between gap-2 border-primary/20 bg-background hover:border-primary/40 hover:bg-primary/5 sm:min-w-[140px] sm:max-w-[220px]"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium sm:max-w-[140px]">
              {selectedBranch?.name || 'Select Branch'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
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
