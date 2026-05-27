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
  ArrowLeft,
  Send, 
  Paperclip, 
  Trash2,
  Smile,
  Check,
  CheckCheck,
  User,
  Search,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const CHAT_TIMESTAMP_FORMAT = 'MMM d, yyyy h:mm a';

interface PrivateMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  is_read: boolean;
  created_at: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  branch_id: string | null;
}

interface ConversationPreview {
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface PrivateMessageBoxProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivateMessageBox = ({ isOpen, onClose }: PrivateMessageBoxProps) => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const isAdmin = userRole === 'admin';
  
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEmojiSelect = (emoji: { native: string }) => {
    setMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Fetch current user's profile to get their branch_id
  const { data: currentUserProfile } = useQuery({
    queryKey: ['current-user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, branch_id')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch all users for starting new conversations (filtered by role and branch)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['dm-users', isAdmin, currentUserProfile?.branch_id, selectedBranch?.id],
    queryFn: async () => {
      // For admin, fetch all profiles
      if (isAdmin) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, branch_id')
          .neq('id', user?.id || '')
          .order('full_name');
        
        if (error) throw error;
        return data as UserProfile[];
      }
      
      // For non-admin, get branch_id from profile or selected branch
      const userBranchId = currentUserProfile?.branch_id || selectedBranch?.id;
      
      if (!userBranchId) {
        // If no branch assigned, return empty list
        return [];
      }
      
      // Fetch profiles that belong to the same branch
      const { data: branchProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, branch_id')
        .eq('branch_id', userBranchId)
        .neq('id', user?.id || '')
        .order('full_name');
      
      if (profileError) throw profileError;
      
      return (branchProfiles || []) as UserProfile[];
    },
    enabled: !!user?.id && (isAdmin || !!currentUserProfile),
  });

  // Fetch private messages
  const { data: messages = [] } = useQuery({
    queryKey: ['private-messages', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('private_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as PrivateMessage[];
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  // Get conversation previews (list of users with recent messages)
  const conversations = useCallback((): ConversationPreview[] => {
    if (!user?.id || !messages.length) return [];
    
    const conversationMap = new Map<string, { messages: PrivateMessage[]; unreadCount: number }>();
    
    messages.forEach(msg => {
      const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      const existing = conversationMap.get(partnerId);
      
      if (existing) {
        existing.messages.push(msg);
        if (msg.recipient_id === user.id && !msg.is_read) {
          existing.unreadCount++;
        }
      } else {
        conversationMap.set(partnerId, {
          messages: [msg],
          unreadCount: msg.recipient_id === user.id && !msg.is_read ? 1 : 0,
        });
      }
    });

    return Array.from(conversationMap.entries())
      .map(([partnerId, data]) => {
        const partner = allUsers.find(u => u.id === partnerId);
        const lastMsg = data.messages[data.messages.length - 1];
        return {
          partnerId,
          partnerName: partner?.full_name || 'Unknown',
          partnerEmail: partner?.email || '',
          lastMessage: lastMsg.content,
          lastMessageTime: lastMsg.created_at,
          unreadCount: data.unreadCount,
        };
      })
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  }, [messages, user?.id, allUsers]);

  // Get messages for selected conversation
  const conversationMessages = useCallback((): PrivateMessage[] => {
    if (!selectedUserId || !user?.id) return [];
    return messages.filter(
      msg =>
        (msg.sender_id === user.id && msg.recipient_id === selectedUserId) ||
        (msg.sender_id === selectedUserId && msg.recipient_id === user.id)
    );
  }, [messages, selectedUserId, user?.id]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('private-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_messages',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['private-messages', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (selectedUserId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages, selectedUserId]);

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (!selectedUserId || !user?.id) return;
    
    const unreadMessages = messages.filter(
      msg => msg.sender_id === selectedUserId && msg.recipient_id === user.id && !msg.is_read
    );

    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async msg => {
        await supabase
          .from('private_messages')
          .update({ is_read: true })
          .eq('id', msg.id);
      });
      queryClient.invalidateQueries({ queryKey: ['private-messages', user.id] });
    }
  }, [selectedUserId, messages, user?.id, queryClient]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async ({ content, fileUrl, fileName }: { content: string; fileUrl?: string; fileName?: string }) => {
      if (!selectedUserId) throw new Error('No recipient selected');
      
      const { error } = await supabase
        .from('private_messages')
        .insert({
          sender_id: user?.id,
          recipient_id: selectedUserId,
          content,
          file_url: fileUrl || null,
          file_name: fileName || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['private-messages', user?.id] });
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
        .from('private_messages')
        .delete()
        .eq('id', messageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-messages', user?.id] });
      toast.success('Message deleted');
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate({ content: message.trim() });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
      const fileName = `dm-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
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

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const isOwnMessage = (senderId: string) => senderId === user?.id;

  const selectedUser = allUsers.find(u => u.id === selectedUserId);

  // Filter users for new conversation
  const filteredUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalUnread = conversations().reduce((sum, c) => sum + c.unreadCount, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl h-[80vh] bg-card rounded-lg shadow-lg flex overflow-hidden">
        {/* Conversation List */}
        <div className={cn(
          "w-full md:w-80 border-r border-border flex flex-col",
          selectedUserId && "hidden md:flex"
        )}>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Direct Messages</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Search Users */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {/* Existing Conversations */}
            {conversations().length > 0 && !searchTerm && (
              <div className="p-2">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Recent</p>
                {conversations().map((conv) => (
                  <button
                    key={conv.partnerId}
                    onClick={() => setSelectedUserId(conv.partnerId)}
                    className={cn(
                      "w-full p-3 rounded-lg flex items-center gap-3 hover:bg-accent transition-colors text-left",
                      selectedUserId === conv.partnerId && "bg-accent"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(conv.partnerName, conv.partnerEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm truncate">{conv.partnerName}</p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(conv.lastMessageTime), CHAT_TIMESTAMP_FORMAT)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* All Users (for starting new conversations) */}
            {(searchTerm || conversations().length === 0) && (
              <div className="p-2">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                  {searchTerm ? 'Search Results' : 'Start a Conversation'}
                </p>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setSearchTerm('');
                    }}
                    className={cn(
                      "w-full p-3 rounded-lg flex items-center gap-3 hover:bg-accent transition-colors text-left",
                      selectedUserId === u.id && "bg-accent"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(u.full_name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.full_name || u.email.split('@')[0]}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedUserId && "hidden md:flex"
        )}>
          {selectedUserId && selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedUserId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {getInitials(selectedUser.full_name, selectedUser.email)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{selectedUser.full_name || selectedUser.email.split('@')[0]}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {conversationMessages().map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2",
                        isOwnMessage(msg.sender_id) ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg p-3 relative group",
                          isOwnMessage(msg.sender_id)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {/* File attachment */}
                        {msg.file_url && (
                          <div className="mb-2">
                            {msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <img
                                src={msg.file_url}
                                alt={msg.file_name || 'attachment'}
                                className="max-w-full rounded-md cursor-pointer"
                                onClick={() => window.open(msg.file_url!, '_blank')}
                              />
                            ) : (
                              <a
                                href={msg.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline"
                              >
                                📎 {msg.file_name}
                              </a>
                            )}
                          </div>
                        )}
                        
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        
                        <div className={cn(
                          "flex items-center gap-1 mt-1",
                          isOwnMessage(msg.sender_id) ? "justify-end" : "justify-start"
                        )}>
                          <span className={cn(
                            "text-xs",
                            isOwnMessage(msg.sender_id) ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {format(new Date(msg.created_at), CHAT_TIMESTAMP_FORMAT)}
                          </span>
                          {isOwnMessage(msg.sender_id) && (
                            msg.is_read ? (
                              <CheckCheck className="h-3 w-3 text-primary-foreground/70" />
                            ) : (
                              <Check className="h-3 w-3 text-primary-foreground/70" />
                            )
                          )}
                        </div>

                        {/* Delete button for own messages */}
                        {(isOwnMessage(msg.sender_id) || isAdmin) && (
                          <button
                            onClick={() => deleteMessage.mutate(msg.id)}
                            className={cn(
                              "absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full",
                              isOwnMessage(msg.sender_id) ? "-left-8" : "-right-8",
                              "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            )}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-3 border-t border-border">
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
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="shrink-0"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  
                  <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-none" align="start">
                      <Picker
                        data={data}
                        onEmojiSelect={handleEmojiSelect}
                        theme="light"
                        previewPosition="none"
                        skinTonePosition="none"
                      />
                    </PopoverContent>
                  </Popover>

                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Type a message..."
                    className="flex-1"
                    disabled={uploading}
                  />
                  
                  <Button
                    onClick={handleSend}
                    disabled={!message.trim() || uploading}
                    size="icon"
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Select a conversation or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
