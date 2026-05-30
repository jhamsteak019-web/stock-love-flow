import { useState } from 'react';
import { Send, TicketPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { getNotificationRecipientIdsByRoles } from '@/lib/notificationRecipients';
import { toast } from 'sonner';

const ticketTypes = [
  { value: 'Issue Report', label: 'Issue Report' },
  { value: 'Correction Request', label: 'Correction Request' },
  { value: 'Approval Request', label: 'Approval Request' },
  { value: 'System Concern', label: 'System Concern' },
];

export const TicketRequestButton = () => {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [ticketType, setTicketType] = useState(ticketTypes[0].value);
  const [details, setDetails] = useState('');

  const resetForm = () => {
    setTitle('');
    setTicketType(ticketTypes[0].value);
    setDetails('');
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in before creating a ticket.');
      return;
    }

    if (!title.trim() || !details.trim()) {
      toast.error('Please add a title and details.');
      return;
    }

    setSaving(true);

    try {
      const currentPath = window.location.pathname;
      const branchName = selectedBranch?.name || 'No branch selected';
      const content = [
        details.trim(),
        '',
        `Page: ${currentPath}`,
        `Branch: ${branchName}`,
      ].join('\n');

      const { data: ticket, error: ticketError } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title: title.trim(),
          concern: ticketType,
          content,
          branch_id: selectedBranch?.id || null,
          is_public: false,
          status: 'waiting_approval',
          color: '#2563eb',
        })
        .select('id')
        .single();

      if (ticketError) throw ticketError;

      const recipientIds = await getNotificationRecipientIdsByRoles(['admin', 'assistant'], {
        branchId: selectedBranch?.id || null,
        includeUnassigned: true,
        excludeUserId: user.id,
      });

      if (recipientIds.length > 0) {
        const notifications = recipientIds.map((userId) => ({
          user_id: userId,
          title: 'New Ticket Request',
          message: `${user.email || 'A user'} submitted a ${ticketType}: "${title.trim()}". Branch: ${branchName}.`,
          type: 'ticket',
          link: '/notes',
          created_by: user.id,
        }));

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (notificationError) throw notificationError;
      }

      queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-notification-count'] });
      toast.success('Ticket submitted. Admin/Assistant has been notified.');
      resetForm();
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit ticket.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2">
          <TicketPlus className="h-4 w-4" />
          <span className="hidden sm:inline">New Ticket</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Ticket</DialogTitle>
          <DialogDescription>
            Report an issue or request approval. Admin and Assistant will receive a notification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <Select value={ticketType} onValueChange={setTicketType}>
              <SelectTrigger>
                <SelectValue placeholder="Ticket type" />
              </SelectTrigger>
              <SelectContent>
                {ticketTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Wrong amount in Summary Report"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Details</label>
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Describe kung anong mali, anong bill/branch/date, at ano ang dapat mangyari."
              className="min-h-32"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            <Send className="h-4 w-4" />
            {saving ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
