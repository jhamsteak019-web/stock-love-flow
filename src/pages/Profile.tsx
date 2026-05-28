import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  Clock3,
  IdCard,
  Mail,
  Monitor,
  Network,
  Pencil,
  Phone,
  Shield,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getRoleDisplayName } from '@/lib/roleUtils';
import { supabase } from '@/integrations/supabase/client';

interface ProfileRecord {
  id: string;
  email: string;
  full_name: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
  branches?: {
    name: string;
    code: string;
  } | null;
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  return format(new Date(value), 'MMM dd, yyyy h:mm a');
};

const blankProfileForm = {
  fullName: '',
  email: '',
  position: '',
  telephone: '',
  ipAddress: '',
  anyDesk: '',
  printer: '',
};

const Profile = () => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(blankProfileForm);

  const profileQuery = useQuery({
    queryKey: ['current-profile-page', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, branch_id, created_at, updated_at, branches(name, code)')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as ProfileRecord | null;
    },
    enabled: !!user?.id,
  });

  const profile = profileQuery.data;
  const userMetadata = user?.user_metadata || {};
  const position = typeof userMetadata.position === 'string' ? userMetadata.position : '';
  const telephone = typeof userMetadata.telephone === 'string' ? userMetadata.telephone : '';
  const ipAddress = typeof userMetadata.ip_address === 'string' ? userMetadata.ip_address : '';
  const anyDesk = typeof userMetadata.anydesk === 'string' ? userMetadata.anydesk : '';
  const printer = typeof userMetadata.printer === 'string' ? userMetadata.printer : '';
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const displayEmail = profile?.email || user?.email || '';
  const initials = useMemo(() => {
    return displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  }, [displayName]);

  useEffect(() => {
    setProfileForm({
      fullName: displayName,
      email: displayEmail,
      position,
      telephone,
      ipAddress,
      anyDesk,
      printer,
    });
  }, [anyDesk, displayEmail, displayName, ipAddress, position, printer, telephone]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not logged in');
      const nextName = profileForm.fullName.trim();
      const nextEmail = profileForm.email.trim();
      if (!nextName) throw new Error('Full name is required');
      if (!nextEmail) throw new Error('Email is required');

      const nextMetadata = {
        ...user.user_metadata,
        full_name: nextName,
        position: profileForm.position.trim(),
        telephone: profileForm.telephone.trim(),
        ip_address: profileForm.ipAddress.trim(),
        anydesk: profileForm.anyDesk.trim(),
        printer: profileForm.printer.trim(),
      };

      const authUpdates: {
        email?: string;
        data: typeof nextMetadata;
      } = {
        data: nextMetadata,
      };

      if (nextEmail !== user.email) {
        authUpdates.email = nextEmail;
      }

      const { error: authError } = await supabase.auth.updateUser(authUpdates);
      if (authError) throw authError;

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: nextName,
          email: nextEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-profile-page'] });
      setIsEditOpen(false);
      toast({ title: 'Profile updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Profile update failed', description: error.message, variant: 'destructive' });
    },
  });

  const profileItems = [
    {
      label: 'User ID',
      value: user?.id ? user.id.slice(0, 8).toUpperCase() : 'N/A',
      icon: IdCard,
    },
    {
      label: 'Role',
      value: getRoleDisplayName(userRole),
      icon: Shield,
    },
    {
      label: 'Branch',
      value: profile?.branches?.name || 'N/A',
      icon: Building2,
    },
    {
      label: 'Position',
      value: position || 'N/A',
      icon: Briefcase,
    },
    {
      label: 'Last Activity',
      value: formatDateTime(user?.last_sign_in_at),
      icon: Clock3,
    },
    {
      label: 'Joined',
      value: formatDateTime(profile?.created_at || user?.created_at),
      icon: CalendarDays,
    },
    {
      label: 'Account Email',
      value: displayEmail || 'N/A',
      icon: Mail,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="flex items-center gap-4 border-b pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <UserRound className="h-7 w-7" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">User Profile</h2>
            <Badge variant="secondary" className="gap-1">
              <BadgeCheck className="h-3.5 w-3.5" />
              Active
            </Badge>
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Account identity and assigned resources
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-28 w-28 rounded-2xl">
                <AvatarFallback className="rounded-2xl bg-primary text-3xl font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <h3 className="mt-5 text-xl font-semibold">{displayName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{displayEmail}</p>
              <Badge variant="outline" className="mt-3">
                {getRoleDisplayName(userRole)}
              </Badge>
            </div>

            <Separator className="my-6" />

            <div className="grid gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={() => setIsEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {profileItems.map((item) => (
                <div key={item.label} className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                      <p className="mt-1 truncate font-medium">{item.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <Phone className="mb-4 h-5 w-5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Telephone</p>
            <p className="mt-2 text-lg font-semibold">{telephone || 'N/A'}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <Network className="mb-4 h-5 w-5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">IP Address</p>
            <p className="mt-2 text-lg font-semibold">{ipAddress || 'N/A'}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <Monitor className="mb-4 h-5 w-5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">AnyDesk</p>
            <p className="mt-2 text-lg font-semibold">{anyDesk || 'N/A'}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <Briefcase className="mb-4 h-5 w-5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Printer</p>
            <p className="mt-2 text-lg font-semibold">{printer || 'N/A'}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardContent className="flex min-h-[180px] flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <BadgeCheck className="mb-4 h-10 w-10 opacity-40" />
          <p className="text-sm font-semibold uppercase tracking-[0.18em]">No recognition records detected</p>
          <p className="mt-2 text-sm">Historical achievements will appear here once records are available.</p>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full Name</Label>
              <Input
                id="full-name"
                value={profileForm.fullName}
                onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-position">Position</Label>
              <Input
                id="profile-position"
                value={profileForm.position}
                onChange={(event) => setProfileForm((current) => ({ ...current, position: event.target.value }))}
                placeholder="Position"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-telephone">Telephone</Label>
              <Input
                id="profile-telephone"
                value={profileForm.telephone}
                onChange={(event) => setProfileForm((current) => ({ ...current, telephone: event.target.value }))}
                placeholder="Telephone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-ip-address">IP Address</Label>
              <Input
                id="profile-ip-address"
                value={profileForm.ipAddress}
                onChange={(event) => setProfileForm((current) => ({ ...current, ipAddress: event.target.value }))}
                placeholder="IP address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-anydesk">AnyDesk</Label>
              <Input
                id="profile-anydesk"
                value={profileForm.anyDesk}
                onChange={(event) => setProfileForm((current) => ({ ...current, anyDesk: event.target.value }))}
                placeholder="AnyDesk"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile-printer">Printer</Label>
              <Input
                id="profile-printer"
                value={profileForm.printer}
                onChange={(event) => setProfileForm((current) => ({ ...current, printer: event.target.value }))}
                placeholder="Printer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending || !profileForm.fullName.trim() || !profileForm.email.trim()}
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
