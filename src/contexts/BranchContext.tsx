import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export interface Branch {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

interface BranchContextType {
  branches: Branch[];
  selectedBranch: Branch | null;
  setSelectedBranch: (branch: Branch | null) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranchState] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, userRole } = useAuth();

  const fetchBranches = async () => {
    try {
      // First fetch all active branches
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (branchesError) throw branchesError;
      setBranches(branchesData || []);
      
      // Fetch user's assigned branch from their profile
      if (user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('branch_id')
          .eq('id', user.id)
          .single();

        if (!profileError && profileData?.branch_id && branchesData) {
          // User has an assigned branch - use it
          const assignedBranch = branchesData.find(b => b.id === profileData.branch_id);
          if (assignedBranch) {
            setSelectedBranchState(assignedBranch);
            localStorage.setItem('selectedBranchId', assignedBranch.id);
            setLoading(false);
            return;
          }
        }
      }

      // For admins without assigned branch, use localStorage or first available
      if (userRole === 'admin') {
        const savedBranchId = localStorage.getItem('selectedBranchId');
        if (savedBranchId && branchesData) {
          const savedBranch = branchesData.find(b => b.id === savedBranchId);
          if (savedBranch) {
            setSelectedBranchState(savedBranch);
          } else if (branchesData.length > 0) {
            setSelectedBranchState(branchesData[0]);
            localStorage.setItem('selectedBranchId', branchesData[0].id);
          }
        } else if (branchesData && branchesData.length > 0) {
          setSelectedBranchState(branchesData[0]);
          localStorage.setItem('selectedBranchId', branchesData[0].id);
        }
      } else if (branchesData && branchesData.length > 0) {
        // Non-admin without assigned branch - use first as fallback
        setSelectedBranchState(branchesData[0]);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBranches();
    }
  }, [user, userRole]);

  const setSelectedBranch = (branch: Branch | null) => {
    setSelectedBranchState(branch);
    if (branch) {
      localStorage.setItem('selectedBranchId', branch.id);
    } else {
      localStorage.removeItem('selectedBranchId');
    }
  };

  return (
    <BranchContext.Provider value={{ 
      branches, 
      selectedBranch, 
      setSelectedBranch, 
      loading,
      refetch: fetchBranches 
    }}>
      {children}
    </BranchContext.Provider>
  );
};
