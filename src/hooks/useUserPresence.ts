import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface UserPresence {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  online_at: string;
  is_online: boolean;
}

export const useUserPresence = () => {
  const [presences, setPresences] = useState<Map<string, UserPresence>>(new Map());
  const [sessionStart] = useState<Date>(() => new Date());
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Use ref for toast to avoid dependency issues
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Track current user's presence
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('user-presence', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const newPresences = new Map<string, UserPresence>();
        
        Object.entries(state).forEach(([key, values]) => {
          const presence = (values as any[])[0];
          if (presence) {
            newPresences.set(key, {
              id: key,
              user_id: presence.user_id,
              email: presence.email || '',
              full_name: presence.full_name || null,
              online_at: presence.online_at,
              is_online: true,
            });
          }
        });
        
        setPresences(newPresences);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences: joinedPresences }) => {
        const presence = joinedPresences[0];
        if (presence && key !== user.id) {
          const displayName = presence.full_name || presence.email || 'A user';
          toastRef.current({
            title: '🟢 User Online',
            description: `${displayName} is now online`,
          });
        }
        if (presence) {
          setPresences(prev => {
            const next = new Map(prev);
            next.set(key, {
              id: key,
              user_id: presence.user_id,
              email: presence.email || '',
              full_name: presence.full_name || null,
              online_at: presence.online_at,
              is_online: true,
            });
            return next;
          });
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const presence = leftPresences[0];
        if (presence && key !== user.id) {
          const displayName = presence.full_name || presence.email || 'A user';
          toastRef.current({
            title: '⚫ User Offline',
            description: `${displayName} went offline`,
          });
        }
        setPresences(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  const isUserOnline = useCallback((userId: string) => {
    return presences.has(userId);
  }, [presences]);

  const getUserOnlineTime = useCallback((userId: string) => {
    const presence = presences.get(userId);
    if (!presence) return null;
    
    const onlineAt = new Date(presence.online_at);
    const now = new Date();
    const diffMs = now.getTime() - onlineAt.getTime();
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, [presences]);

  const getOnlineUsersCount = useCallback(() => {
    return presences.size;
  }, [presences]);

  return {
    presences,
    isUserOnline,
    getUserOnlineTime,
    getOnlineUsersCount,
    sessionStart,
  };
};
