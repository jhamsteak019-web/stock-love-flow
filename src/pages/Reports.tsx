import { useState } from 'react';
// Page: Bulletin Report
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileText,
  Play,
  Trash2,
  Loader2,
  Search,
  Presentation,
  Download,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { PresentationViewer } from '@/components/reports/PresentationViewer';

interface Report {
  id: string;
  user_id: string;
  title: string;
  file_url: string;
  file_name: string;
  status: string;
  branch_id: string | null;
  created_at: string;
}

const Reports = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showPresentation, setShowPresentation] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canUpload = userRole === 'admin' || userRole === 'staff';
  const canDelete = userRole === 'admin';

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports', selectedBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (selectedBranch) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Report[];
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.type !== 'application/pdf') {
      toast({ title: 'Error', description: 'Only PDF files are allowed', variant: 'destructive' });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File must be under 20MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('report-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('report-files')
        .getPublicUrl(fileName);

      const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');

      const { error: insertError } = await supabase
        .from('reports')
        .insert([{
          user_id: user.id,
          title,
          file_url: publicUrl,
          file_name: file.name,
          status: 'ready',
          branch_id: selectedBranch ? selectedBranch.id : null,
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast({ title: 'Success', description: 'Report uploaded successfully!' });
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to upload report', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast({ title: 'Deleted', description: 'Report deleted successfully' });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const filteredReports = reports.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.file_name.toLowerCase().includes(search.toLowerCase())
  );

  const openPresentation = (report: Report) => {
    setSelectedReport(report);
    setShowPresentation(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bulletin Report</h1>
          <p className="text-sm text-muted-foreground">Upload PDF reports and view them as presentations</p>
        </div>
        <label className="cursor-pointer">
          <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
          <Button asChild disabled={uploading}>
            <span>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading...' : 'Upload PDF'}
            </span>
          </Button>
        </label>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search reports..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredReports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Presentation className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No reports yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Upload a PDF to view it as a presentation</p>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
              <Button variant="outline" asChild><span><Plus className="h-4 w-4" /> Upload your first report</span></Button>
            </label>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredReports.map(report => (
            <Card
              key={report.id}
              className="group cursor-pointer hover:border-primary/50 transition-all"
              onClick={() => openPresentation(report)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <CardTitle className="text-sm font-medium truncate">{report.title}</CardTitle>
                  </div>
                  <Badge variant="default" className="shrink-0 text-xs">PDF</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-3">
                  {format(new Date(report.created_at), 'MMM d, yyyy h:mm a')}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" className="flex-1" onClick={e => { e.stopPropagation(); openPresentation(report); }}>
                    <Play className="h-3 w-3" /> View
                  </Button>
                  <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); window.open(report.file_url, '_blank'); }}>
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={e => { e.stopPropagation(); setDeleteId(report.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showPresentation && selectedReport && (
        <PresentationViewer
          fileUrl={selectedReport.file_url}
          title={selectedReport.title}
          onClose={() => setShowPresentation(false)}
        />
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Report</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This will permanently delete this report.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;
