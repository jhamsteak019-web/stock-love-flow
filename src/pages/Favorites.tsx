import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Heart, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { CollectionPhotoCell } from '@/components/collection/CollectionPhotoCell';

interface CollectionItem {
  id: string;
  item_name: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  photo_url: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  is_favorite: boolean;
  favorite_remarks: string | null;
}

const Favorites = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Fetch favorite items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['favorite-items'],
    queryFn: async () => {
      const allItems: CollectionItem[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('collection_items')
          .select('*')
          .eq('is_favorite', true)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allItems.push(...(data as CollectionItem[]));
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      return allItems;
    }
  });

  // Remove from favorites mutation
  const removeFavoriteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collection_items')
        .update({ is_favorite: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite-items'] });
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      toast.success('Removed from favorites');
    },
    onError: (error: any) => {
      toast.error(`Failed to remove: ${error.message}`);
    }
  });

  // Filter items by search
  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500 fill-red-500" />
            Favorites ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search favorites..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Favorites List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Favorite Items ({filteredItems.length})</CardTitle>
          {totalPages > 1 && (
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredItems.length)} of {filteredItems.length}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No favorites yet</p>
              <p className="text-sm">Mark items as favorite from Collection Items</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Photo</TableHead>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="w-[120px]">UPC</TableHead>
                      <TableHead className="min-w-[150px]">Remarks</TableHead>
                      <TableHead className="w-[100px]">Category</TableHead>
                      <TableHead className="w-[100px] text-right">Price</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item) => {
                      const descParts = item.description?.split(' | ') || [];
                      const upc = descParts[0]?.startsWith('UPC: ') ? descParts[0].replace('UPC: ', '') : '';
                      const description = upc ? descParts.slice(1).join(' | ') : item.description;
                      const priceMatch = item.notes?.match(/Price: ([\d.]+)/);
                      const price = priceMatch ? parseFloat(priceMatch[1]) : (item.quantity || 0);
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="p-2">
                            <CollectionPhotoCell
                              itemId={item.id}
                              photoUrl={item.photo_url}
                              itemName={item.item_name}
                              onPhotoUpdate={() => queryClient.invalidateQueries({ queryKey: ['favorite-items'] })}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.item_name}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{upc || '-'}</TableCell>
                          <TableCell className="max-w-[200px] text-muted-foreground">
                            {item.favorite_remarks || <span className="italic text-muted-foreground/50">No remarks</span>}
                          </TableCell>
                          <TableCell>
                            {item.category ? (
                              <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-right">{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFavoriteMutation.mutate(item.id)}
                              disabled={removeFavoriteMutation.isPending}
                              className="h-8 w-8"
                              title="Remove from favorites"
                            >
                              <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-4 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Favorites;
