import { useEffect } from 'react';
import { useUserPresence } from '@/hooks/useUserPresence';

/**
 * This component initializes and maintains the user's presence tracking.
 * It should be rendered inside authenticated routes to track online status.
 */
export const PresenceTracker = () => {
  // Just calling the hook initializes presence tracking
  useUserPresence();
  
  return null;
};
