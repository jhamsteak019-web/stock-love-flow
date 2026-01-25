import { useState, useEffect } from 'react';
import { Users, Edit2, Shield, ShieldCheck, Eye, X, Check, Trash2, Circle, Clock, Info, UserCheck, Key, UserCog, Building2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useUsers, UserWithRole } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPresence } from '@/hooks/useUserPresence';
import { UserRole } from '@/types/inventory';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getRoleDisplayName } from '@/lib/roleUtils';
import { useBranch } from '@/contexts/BranchContext';

const ManageUsers = () => {
  const { users, loading, updateProfile, updateUserRole, deleteUser, refetch } = useUsers();
  const { user: currentUser, userRole } = useAuth();
  const { isUserOnline, getUserOnlineTime, getOnlineUsersCount } = useUserPresence();
  const { toast } = useToast();
  const { branches } = useBranch();
  const isAdmin = userRole === 'admin';
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '' });
  const [, forceUpdate] = useState(0);
  
  // Password change state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<UserWithRole | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Force re-render every minute to update online time
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const startEditing = (user: UserWithRole) => {
    setEditingUser(user.id);
    setEditForm({
      full_name: user.full_name || '',
      email: user.email,
    });
  };

  const cancelEditing = () => {
    setEditingUser(null);
    setEditForm({ full_name: '', email: '' });
  };

  const saveEdit = async (userId: string) => {
    const success = await updateProfile(userId, {
      full_name: editForm.full_name,
      email: editForm.email,
    });
    if (success) {
      setEditingUser(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    await updateUserRole(userId, newRole);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    await deleteUser(userId);
  };

  const openPasswordDialog = (user: UserWithRole) => {
    setSelectedUserForPassword(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordDialogOpen(true);
  };

  const handleBranchChange = async (userId: string, branchId: string | null) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ branch_id: branchId })
        .eq('id', userId);
      
      if (error) throw error;
      
      toast({ title: 'Success', description: 'Branch assignment updated' });
      refetch();
    } catch (error: any) {
      console.error('Error updating branch:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update branch', variant: 'destructive' });
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUserForPassword) return;
    
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setChangingPassword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('update-user-password', {
        body: { userId: selectedUserForPassword.id, newPassword },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({ title: 'Success', description: `Password updated for ${selectedUserForPassword.full_name || selectedUserForPassword.email}` });
      setPasswordDialogOpen(false);
      setSelectedUserForPassword(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({ title: 'Error', description: error.message || 'Failed to change password', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">User Management</h2>
                <p className="text-sm text-muted-foreground">Manage user profiles and roles</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <Circle className="h-2 w-2 fill-green-500 text-green-500" />
              {getOnlineUsersCount()} Online
            </Badge>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[150px]">Name</TableHead>
              <TableHead className="w-[200px]">Email</TableHead>
              <TableHead className="w-[130px]">Role</TableHead>
              <TableHead className="w-[140px]">Assigned Branch</TableHead>
              <TableHead className="w-[120px]">Joined</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No users found</p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const online = isUserOnline(user.id);
                const onlineTime = getUserOnlineTime(user.id);
                
                return (
                  <TableRow key={user.id} className="animate-fade-in">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Circle 
                          className={`h-3 w-3 ${online 
                            ? 'fill-green-500 text-green-500' 
                            : 'fill-muted text-muted-foreground'
                          }`} 
                        />
                        <span className={`text-xs ${online ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingUser === user.id ? (
                        <Input
                          value={editForm.full_name}
                          onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                          placeholder="Full name"
                          className="w-full"
                        />
                      ) : (
                        <span className="font-medium">{user.full_name || 'No name'}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {editingUser === user.id ? (
                        <Input
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="Email"
                          className="w-full"
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm truncate block">{user.email}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {currentUser?.id === user.id ? (
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="gap-1">
                          {user.role === 'admin' ? <ShieldCheck className="h-3 w-3" /> : user.role === 'viewer' ? <Eye className="h-3 w-3" /> : user.role === 'teamleader' ? <UserCog className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                          {getRoleDisplayName(user.role)}
                        </Badge>
                      ) : user.role === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => handleRoleChange(user.id, 'viewer')}
                          >
                            <UserCheck className="h-3 w-3" />
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(val) => handleRoleChange(user.id, val as UserRole)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-3 w-3" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="staff">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Staff
                              </div>
                            </SelectItem>
                            <SelectItem value="hr">
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                HR
                              </div>
                            </SelectItem>
                            <SelectItem value="oic">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                OIC
                              </div>
                            </SelectItem>
                            <SelectItem value="teamleader">
                              <div className="flex items-center gap-2">
                                <UserCog className="h-3 w-3" />
                                Team Leader
                              </div>
                            </SelectItem>
                            <SelectItem value="uploader">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                Uploader
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                Viewer
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Select
                          value={user.branch_id || 'none'}
                          onValueChange={(val) => handleBranchChange(user.id, val === 'none' ? null : val)}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">No Branch</span>
                            </SelectItem>
                            {branches.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id}>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-3 w-3" />
                                  {branch.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {branches.find(b => b.id === user.branch_id)?.name || '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {editingUser === user.id ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => saveEdit(user.id)}>
                            <Check className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={cancelEditing}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => startEditing(user)} title="Edit user">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openPasswordDialog(user)}
                            title="Change password"
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          {currentUser?.id !== user.id && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-destructive hover:text-destructive"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Change password for {selectedUserForPassword?.full_name || selectedUserForPassword?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
            {newPassword && newPassword.length < 6 && (
              <p className="text-sm text-destructive">Password must be at least 6 characters</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleChangePassword} 
              disabled={changingPassword || newPassword.length < 6 || newPassword !== confirmPassword}
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Section */}
      <Alert className="bg-muted/50">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Notes:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
            <li><strong>Pending</strong> - New accounts waiting for admin approval. Click "Approve" to grant access.</li>
            <li><strong>Admin</strong> - Full access to all features including user management, inventory, and reports.</li>
            <li><strong>Team Leader</strong> - Extended staff access with team management capabilities.</li>
            <li><strong>Staff</strong> - Limited access to inventory operations and deliveries.</li>
            <li><strong>Uploader</strong> - Can view all pages but cannot edit anything, only upload photos.</li>
            <li>You cannot change your own role or delete your own account.</li>
            <li>Online status updates in real-time. Green dot indicates the user is currently active.</li>
            <li>Click the key icon to change a user's password.</li>
            <li>Deleting a user will permanently remove all their data. This action cannot be undone.</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default ManageUsers;
