import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  MessageCircle, 
  X, 
  Send, 
  Paperclip, 
  Image as ImageIcon,
  Trash2,
  AtSign,
  Volume2,
  VolumeX,
  Reply,
  XCircle,
  Building2,
  Smile
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log('Could not play notification sound:', error);
  }
};

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  mentions: string[];
  reply_to_id: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    email: string;
  };
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
}

export const TeamChatBox = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch, userBranch } = useBranch();
  const queryClient = useQueryClient();
  const isAdmin = userRole === 'admin';
  
  // For non-admins, use their assigned branch; for admins, use selected branch
  const currentBranchId = isAdmin ? selectedBranch?.id : userBranch?.id;
  const currentBranchName = isAdmin ? selectedBranch?.name : userBranch?.name;
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('chat-sound-enabled');
    return stored !== 'false'; // Default to true
  });
  const [unreadCount, setUnreadCount] = useState(() => {
    const stored = localStorage.getItem('chat-unread-count');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lastReadTimestamp, setLastReadTimestamp] = useState(() => {
    return localStorage.getItem('chat-last-read') || new Date().toISOString();
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEmojiSelect = (emoji: { native: string }) => {
    setMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['team-chat-messages'],
    queryFn: async () => {
      const { data: messagesData, error } = await supabase
        .from('team_chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (error) throw error;

      // Fetch user profiles for the messages
      const userIds = [...new Set(messagesData.map(m => m.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      return messagesData.map(msg => ({
        ...msg,
        profiles: profilesMap.get(msg.user_id) || null,
      })) as ChatMessage[];
    },
    refetchInterval: isOpen ? 5000 : 30000, // More frequent when open
  });

  // Fetch users for mentions
  const { data: users = [] } = useQuery({
    queryKey: ['chat-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  // Calculate unread count from messages newer than last read
  useEffect(() => {
    if (!isOpen && messages.length > 0 && user?.id) {
      const unread = messages.filter(
        msg => msg.user_id !== user.id && new Date(msg.created_at) > new Date(lastReadTimestamp)
      ).length;
      setUnreadCount(unread);
      localStorage.setItem('chat-unread-count', unread.toString());
    }
  }, [messages, isOpen, user?.id, lastReadTimestamp]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('team-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_chat_messages',
        },
        (payload: { new: { user_id: string; mentions?: string[] } }) => {
          queryClient.invalidateQueries({ queryKey: ['team-chat-messages'] });
          if (payload.new.user_id !== user?.id) {
            // Play sound if enabled
            if (soundEnabled) {
              playNotificationSound();
            }
            
            if (!isOpen) {
              setUnreadCount(prev => {
                const newCount = prev + 1;
                localStorage.setItem('chat-unread-count', newCount.toString());
                return newCount;
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'team_chat_messages',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['team-chat-messages'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, isOpen, user?.id, soundEnabled]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Reset unread count when opening and update last read timestamp
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      localStorage.setItem('chat-unread-count', '0');
      const now = new Date().toISOString();
      setLastReadTimestamp(now);
      localStorage.setItem('chat-last-read', now);
    }
  }, [isOpen]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async ({ content, fileUrl, fileName, replyToId }: { content: string; fileUrl?: string; fileName?: string; replyToId?: string }) => {
      const { error } = await supabase
        .from('team_chat_messages')
        .insert({
          user_id: user?.id,
          content,
          file_url: fileUrl || null,
          file_name: fileName || null,
          mentions: selectedMentions,
          reply_to_id: replyToId || null,
          branch_id: currentBranchId || null, // Associate message with current branch
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      setSelectedMentions([]);
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['team-chat-messages'] });
    },
    onError: (error) => {
      toast.error('Failed to send message');
      console.error(error);
    },
  });

  // Delete message mutation
  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('team_chat_messages')
        .delete()
        .eq('id', messageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-chat-messages'] });
      toast.success('Message deleted');
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate({ content: message.trim(), replyToId: replyTo?.id });
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  const getReplyMessage = (replyToId: string | null) => {
    if (!replyToId) return null;
    return messages.find(m => m.id === replyToId);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '@') {
      setShowMentions(true);
      setMentionSearch('');
    }
  };

  const handleMentionSelect = (userId: string, userName: string) => {
    if (!selectedMentions.includes(userId)) {
      setSelectedMentions(prev => [...prev, userId]);
    }
    // Replace partial @mention text with proper mention format
    setMessage(prev => {
      const lastAtIndex = prev.lastIndexOf('@');
      if (lastAtIndex >= 0) {
        return prev.substring(0, lastAtIndex) + `@[${userName}] `;
      }
      return prev + `@[${userName}] `;
    });
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(fileName);

      sendMessage.mutate({
        content: message.trim() || `Shared a file: ${file.name}`,
        fileUrl: urlData.publicUrl,
        fileName: file.name,
      });
    } catch (error) {
      toast.error('Failed to upload file');
      console.error(error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.id !== user?.id && 
    (u.full_name?.toLowerCase().includes(mentionSearch.toLowerCase()) ||
     u.email.toLowerCase().includes(mentionSearch.toLowerCase()))
  );

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const isOwnMessage = (messageUserId: string) => messageUserId === user?.id;
  const canDelete = (messageUserId: string) => isOwnMessage(messageUserId) || userRole === 'admin';
  
  // Check if current user is mentioned in message
  const isMentionedInMessage = (msg: ChatMessage) => {
    if (!user?.id) return false;
    // Check mentions array
    if (msg.mentions?.includes(user.id)) return true;
    // Also check if @[username] is in content (fallback)
    const userProfile = users.find(u => u.id === user.id);
    if (userProfile) {
      const nameToCheck = userProfile.full_name || userProfile.email.split('@')[0];
      return msg.content.toLowerCase().includes(`@[${nameToCheck.toLowerCase()}]`);
    }
    return false;
  };

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('chat-sound-enabled', newValue.toString());
      return newValue;
    });
  };

  const renderContent = (content: string) => {
    if (!content) return null;

    // Match @[Name] format and display just the name (inherit bubble text color)
    const parts = content.split(/(@\[[^\]]+\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('@[') && part.endsWith(']')) {
        const name = part.slice(2, -1);
        return (
          <span key={i} className="font-semibold underline text-current">
            {name}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50",
          isOpen && "hidden"
        )}
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Chat Box */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[380px] h-[500px] bg-background border rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex flex-col border-b bg-primary text-primary-foreground">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <span className="font-semibold">Team Chat</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSound}
                  className="h-8 w-8 hover:bg-primary-foreground/20 text-primary-foreground"
                  title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 hover:bg-primary-foreground/20 text-primary-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Branch indicator */}
            <div className="px-4 pb-2 flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-primary-foreground/70" />
              <span className="text-xs text-primary-foreground/80">
                {isAdmin ? (
                  <>All Branches <span className="opacity-60">(Admin)</span></>
                ) : (
                  currentBranchName || 'No Branch'
                )}
              </span>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3 bg-chat-surface">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                <p>No messages yet</p>
                <p className="text-sm">Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2 group",
                      isOwnMessage(msg.user_id) && "flex-row-reverse"
                    )}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10">
                        {getInitials(msg.profiles?.full_name || null, msg.profiles?.email || '')}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "max-w-[70%] min-w-0",
                      isOwnMessage(msg.user_id) && "items-end"
                    )}>
                      <div className={cn(
                        "flex items-center gap-2 mb-0.5",
                        isOwnMessage(msg.user_id) && "flex-row-reverse justify-start"
                      )}>
                        <span className="text-xs font-medium truncate">
                          {msg.profiles?.full_name || msg.profiles?.email?.split('@')[0]}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {format(new Date(msg.created_at), 'h:mm a')}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={() => handleReply(msg)}
                          title="Reply"
                        >
                          <Reply className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        {canDelete(msg.user_id) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => deleteMessage.mutate(msg.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div
                        className={cn(
                          "px-3 py-2 rounded-lg text-sm relative break-words whitespace-pre-wrap",
                          isOwnMessage(msg.user_id)
                            ? "bg-chat-own text-chat-own-foreground"
                            : "bg-chat-bubble text-chat-bubble-foreground",
                          !isOwnMessage(msg.user_id) && isMentionedInMessage(msg) && "border-l-4 border-status-pending"
                        )}
                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                      >
                        {/* Reply Quote */}
                        {msg.reply_to_id && (() => {
                          const repliedMsg = getReplyMessage(msg.reply_to_id);
                          return repliedMsg ? (
                            <div className={cn(
                              "text-xs mb-1 px-2 py-1 rounded border-l-2",
                              isOwnMessage(msg.user_id) 
                                ? "bg-primary-foreground/10 border-primary-foreground/50" 
                                : "bg-muted-foreground/10 border-muted-foreground/50"
                            )}>
                              <span className="font-medium">
                                {repliedMsg.profiles?.full_name || repliedMsg.profiles?.email?.split('@')[0]}
                              </span>
                              <p className="truncate opacity-80">{repliedMsg.content.slice(0, 50)}{repliedMsg.content.length > 50 ? '...' : ''}</p>
                            </div>
                          ) : null;
                        })()}
                        {renderContent(msg.content)}
                        {msg.file_url && (
                          msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block mt-2"
                            >
                              <img
                                src={msg.file_url}
                                alt={msg.file_name || 'Shared image'}
                                className="max-w-full max-h-48 rounded-md object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ) : (
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "flex items-center gap-1 mt-1 text-xs underline",
                                isOwnMessage(msg.user_id) ? "text-primary-foreground/80" : "text-primary"
                              )}
                            >
                              <Paperclip className="h-3 w-3" />
                              {msg.file_name || 'View attachment'}
                            </a>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Mentions Popup */}
          {showMentions && filteredUsers.length > 0 && (
            <div className="absolute bottom-16 left-3 right-3 bg-background border rounded-lg shadow-lg max-h-32 overflow-y-auto">
              {filteredUsers.slice(0, 5).map((u) => (
                <button
                  key={u.id}
                  className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2 text-sm"
                  onClick={() => handleMentionSelect(u.id, u.full_name || u.email.split('@')[0])}
                >
                  <AtSign className="h-3 w-3 text-primary" />
                  <span>{u.full_name || u.email}</span>
                </button>
              ))}
            </div>
          )}

          {/* Reply Preview */}
          {replyTo && (
            <div className="px-3 py-2 border-t bg-muted/50 flex items-center gap-2">
              <Reply className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-primary">
                  Replying to {replyTo.profiles?.full_name || replyTo.profiles?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {replyTo.content.slice(0, 50)}{replyTo.content.length > 50 ? '...' : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setReplyTo(null)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t bg-background">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setShowMentions(!showMentions)}
              >
                <AtSign className="h-4 w-4" />
              </Button>
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-auto p-0 border-none" 
                  side="top" 
                  align="start"
                  sideOffset={8}
                >
                  <Picker 
                    data={data} 
                    onEmojiSelect={handleEmojiSelect}
                    theme="light"
                    previewPosition="none"
                    skinTonePosition="none"
                    maxFrequentRows={2}
                  />
                </PopoverContent>
              </Popover>
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (showMentions) {
                    const lastAtIndex = e.target.value.lastIndexOf('@');
                    if (lastAtIndex >= 0) {
                      setMentionSearch(e.target.value.slice(lastAtIndex + 1));
                    }
                  }
                }}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1"
                disabled={uploading}
              />
              <Button
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={handleSend}
                disabled={!message.trim() || sendMessage.isPending || uploading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
