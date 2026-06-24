import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const PendingAllocation = () => {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Pending Allocation</h2>
            <p className="text-sm text-muted-foreground">Ready for the pending allocation workflow.</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/deliveries">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Deliveries
          </Link>
        </Button>
      </div>

      <Card className="rounded-lg">
        <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
            <ClipboardList className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Pending Allocation</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Sabihin mo lang yung exact rules dito, then ikakabit ko yung table, filters, and actions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingAllocation;
