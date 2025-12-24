import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UserPresence {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  online_at: string;
  is_online: boolean;
}

// Global presence state to share across components
let globalPresences = new Map<string, UserPresence>();
let globalChannel: RealtimeChannel | null = null;
let isInitialized = false;

export const useUserPresence = () => {
  const { user } = useAuth();
  const [presences, setPresences] = useState<Map<string, UserPresence>>(globalPresences);
  const [sessionStart] = useState<Date>(new Date());
  const userIdRef = useRef<string | null>(null);

  // Initialize presence tracking
  useEffect(() => {
    if (!user) {
      // User logged out, clean up
      if (globalChannel) {
        globalChannel.unsubscribe();
        globalChannel = null;
      }
      isInitialized = false;
      globalPresences = new Map();
      setPresences(new Map());
      userIdRef.current = null;
      return;
    }

    // Avoid re-initializing for the same user
    if (userIdRef.current === user.id && isInitialized) {
      return;
    }

    userIdRef.current = user.id;

    // Clean up existing channel if switching users
    if (globalChannel) {
      globalChannel.unsubscribe();
      globalChannel = null;
      isInitialized = false;
    }

    console.log('Initializing presence for user:', user.id);

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    globalChannel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const newPresences = new Map<string, UserPresence>();
        
        console.log('Presence sync:', state);
        
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
        
        globalPresences = newPresences;
        setPresences(new Map(newPresences));
      })
      .on('presence', { event: 'join' }, ({ key, newPresences: joinedPresences }) => {
        console.log('User joined:', key, joinedPresences);
        const presence = joinedPresences[0];
        if (presence) {
          globalPresences.set(key, {
            id: key,
            user_id: presence.user_id,
            email: presence.email || '',
            full_name: presence.full_name || null,
            online_at: presence.online_at,
            is_online: true,
          });
          setPresences(new Map(globalPresences));
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        console.log('User left:', key);
        globalPresences.delete(key);
        setPresences(new Map(globalPresences));
      })
      .subscribe(async (status) => {
        console.log('Presence channel status:', status);
        if (status === 'SUBSCRIBED' && !isInitialized) {
          isInitialized = true;
          const trackData = {
            user_id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
            online_at: new Date().toISOString(),
          };
          console.log('Tracking presence:', trackData);
          await channel.track(trackData);
        }
      });

    return () => {
      // Don't unsubscribe on unmount - keep presence active
      // Only unsubscribe when user changes or logs out
    };
  }, [user?.id]);

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
