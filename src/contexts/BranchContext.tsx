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
  const { user } = useAuth();

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setBranches(data || []);
      
      // Restore selected branch from localStorage or select first
      const savedBranchId = localStorage.getItem('selectedBranchId');
      if (savedBranchId && data) {
        const savedBranch = data.find(b => b.id === savedBranchId);
        if (savedBranch) {
          setSelectedBranchState(savedBranch);
        } else if (data.length > 0) {
          setSelectedBranchState(data[0]);
          localStorage.setItem('selectedBranchId', data[0].id);
        }
      } else if (data && data.length > 0) {
        setSelectedBranchState(data[0]);
        localStorage.setItem('selectedBranchId', data[0].id);
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
  }, [user]);

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
