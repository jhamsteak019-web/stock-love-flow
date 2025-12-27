import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Copy, Link, Trash2, Store, Loader2, Check, X } from 'lucide-react';
import { format } from 'date-fns';

interface StoreToken {
  id: string;
  store_name: string;
  access_token: string;
  is_active: boolean;
  created_at: string;
}

const ManageStoreTokens = () => {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [tokens, setTokens] = useState<StoreToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('store_access_tokens')
        .select('*')
        .order('store_name');

      if (error) throw error;
      setTokens(data || []);
    } catch (err) {
      console.error('Error fetching tokens:', err);
      toast({ title: 'Error', description: 'Failed to load store tokens', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const createToken = async () => {
    if (!newStoreName.trim()) {
      toast({ title: 'Error', description: 'Please enter a store name', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase
        .from('store_access_tokens')
        .insert({ store_name: newStoreName.trim() });

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Error', description: 'A token for this store already exists', variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }

      toast({ title: 'Success', description: 'Store access link created' });
      setShowAddDialog(false);
      setNewStoreName('');
      await fetchTokens();
    } catch (err) {
      console.error('Error creating token:', err);
      toast({ title: 'Error', description: 'Failed to create store token', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('store_access_tokens')
        .update({ is_active: !currentState })
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Success', description: `Token ${!currentState ? 'activated' : 'deactivated'}` });
      await fetchTokens();
    } catch (err) {
      console.error('Error toggling token:', err);
      toast({ title: 'Error', description: 'Failed to update token', variant: 'destructive' });
    }
  };

  const deleteToken = async (id: string) => {
    if (!confirm('Are you sure you want to delete this store access link?')) return;

    try {
      const { error } = await supabase
        .from('store_access_tokens')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Store access link deleted' });
      await fetchTokens();
    } catch (err) {
      console.error('Error deleting token:', err);
      toast({ title: 'Error', description: 'Failed to delete token', variant: 'destructive' });
    }
  };

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/store-portal?token=${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(token);
    toast({ title: 'Copied!', description: 'Store portal link copied to clipboard' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store Portal Links</h1>
          <p className="text-muted-foreground">
            Generate access links for OICs to upload allocation bill photos
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Store
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Store Access Tokens
          </CardTitle>
          <CardDescription>
            Share these links with store OICs so they can upload allocation bill photos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <div className="text-center py-12">
              <Link className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No store tokens created yet</p>
              {isAdmin && (
                <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Store Link
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.store_name}</TableCell>
                    <TableCell>
                      <Badge variant={token.is_active ? 'default' : 'secondary'}>
                        {token.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(token.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyLink(token.access_token)}
                        >
                          {copiedId === token.access_token ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleActive(token.id, token.is_active)}
                            >
                              {token.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteToken(token.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Store Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Store Access Link</DialogTitle>
            <DialogDescription>
              Enter the store name exactly as it appears in the delivery destinations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="e.g., Metro Market - Market-Market"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createToken} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageStoreTokens;
