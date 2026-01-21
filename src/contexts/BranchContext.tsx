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
    if (!user) return;
    
    setLoading(true);
    
    try {
      // Fetch all active branches
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (branchesError) throw branchesError;
      setBranches(branchesData || []);
      
      // ALWAYS fetch user's assigned branch from their profile first
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('branch_id')
        .eq('id', user.id)
        .single();

      console.log('BranchContext - User profile data:', profileData);
      console.log('BranchContext - User role:', userRole);

      // If user has an assigned branch, use it (non-admins are locked to this)
      if (!profileError && profileData?.branch_id && branchesData) {
        const assignedBranch = branchesData.find(b => b.id === profileData.branch_id);
        console.log('BranchContext - Assigned branch found:', assignedBranch);
        
        if (assignedBranch) {
          setSelectedBranchState(assignedBranch);
          localStorage.setItem('selectedBranchId', assignedBranch.id);
          return;
        }
      }

      // Only admins can use localStorage preference (if no assigned branch)
      if (userRole === 'admin') {
        const savedBranchId = localStorage.getItem('selectedBranchId');
        if (savedBranchId && branchesData) {
          const savedBranch = branchesData.find(b => b.id === savedBranchId);
          if (savedBranch) {
            setSelectedBranchState(savedBranch);
            return;
          }
        }
      }
      
      // Fallback: use first available branch
      if (branchesData && branchesData.length > 0) {
        setSelectedBranchState(branchesData[0]);
        localStorage.setItem('selectedBranchId', branchesData[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch whenever user changes (login/logout) or userRole is loaded
  useEffect(() => {
    if (user) {
      fetchBranches();
    } else {
      // Clear state on logout
      setSelectedBranchState(null);
      setBranches([]);
      setLoading(false);
    }
  }, [user?.id, userRole]);

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
