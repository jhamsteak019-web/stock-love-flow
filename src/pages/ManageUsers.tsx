import { useState, useEffect } from 'react';
import { Users, Edit2, Shield, ShieldCheck, X, Check, Trash2, Circle, Clock, Info } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUsers, UserWithRole } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPresence } from '@/hooks/useUserPresence';
import { UserRole } from '@/types/inventory';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const ManageUsers = () => {
  const { users, loading, updateProfile, updateUserRole, deleteUser } = useUsers();
  const { user: currentUser } = useAuth();
  const { isUserOnline, getUserOnlineTime, getOnlineUsersCount } = useUserPresence();
  const { toast } = useToast();
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '' });
  const [, forceUpdate] = useState(0);

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
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Online Duration</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
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
                    <TableCell>
                      {editingUser === user.id ? (
                        <Input
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="Email"
                          className="w-full"
                        />
                      ) : (
                        <span className="text-muted-foreground">{user.email}</span>
                      )}
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
                    <TableCell>
                      {online && onlineTime ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-sm">{onlineTime}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
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
                          <Button variant="ghost" size="icon" onClick={() => startEditing(user)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {currentUser?.id !== user.id && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-destructive hover:text-destructive"
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

      {/* Notes Section */}
      <Alert className="bg-muted/50">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Notes:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
            <li><strong>Admin</strong> - Full access to all features including user management, inventory, and reports.</li>
            <li><strong>Staff</strong> - Limited access to inventory operations and deliveries.</li>
            <li>You cannot change your own role or delete your own account.</li>
            <li>Online status updates in real-time. Green dot indicates the user is currently active.</li>
            <li>Deleting a user will permanently remove all their data. This action cannot be undone.</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default ManageUsers;
