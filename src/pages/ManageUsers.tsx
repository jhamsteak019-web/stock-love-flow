import { useState } from 'react';
import { Users, Edit2, Shield, ShieldCheck, X, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUsers, UserWithRole } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/inventory';
import { format } from 'date-fns';

const ManageUsers = () => {
  const { users, loading, updateProfile, updateUserRole } = useUsers();
  const { user: currentUser } = useAuth();
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '' });

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
    });
    if (success) {
      setEditingUser(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    await updateUserRole(userId, newRole);
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
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">User Management</h2>
              <p className="text-sm text-muted-foreground">Manage user profiles and roles</p>
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No users found</p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className="animate-fade-in">
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
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {currentUser?.id === user.id ? (
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="gap-1">
                        {user.role === 'admin' ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                        {user.role}
                      </Badge>
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
                        </SelectContent>
                      </Select>
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
                      <Button variant="ghost" size="icon" onClick={() => startEditing(user)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ManageUsers;
