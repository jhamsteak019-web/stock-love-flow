import { ClipboardList } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { format } from 'date-fns';

const History = () => {
  const { releases, loading } = useInventory();

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Boxes</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Released</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {releases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No transaction history</p>
              </TableCell>
            </TableRow>
          ) : (
            releases.map((release) => (
              <TableRow key={release.id}>
                <TableCell className="font-medium">{release.inventory_item?.item_name}</TableCell>
                <TableCell>{release.boxes_released}</TableCell>
                <TableCell>{release.destination}</TableCell>
                <TableCell className="text-muted-foreground">{format(new Date(release.date_released), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-muted-foreground">{release.date_delivered ? format(new Date(release.date_delivered), 'MMM d, yyyy') : '-'}</TableCell>
                <TableCell><StatusBadge status={release.delivery_status} /></TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default History;
