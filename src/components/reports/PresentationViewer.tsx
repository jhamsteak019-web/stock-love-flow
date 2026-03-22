import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize,
  Minimize,
  Download,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PresentationViewerProps {
  fileUrl: string;
  title: string;
  onClose: () => void;
}

export const PresentationViewer = ({ fileUrl, title, onClose }: PresentationViewerProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setLoading(true);
        const doc = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) return;
        setTotalPages(doc.numPages);

        const images: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 2.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(canvas.toDataURL('image/png'));
          if (cancelled) return;
        }
        setPageImages(images);
      } catch (err) {
        console.error('Failed to load PDF:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadPdf();
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Auto-scroll thumbnail into view
  useEffect(() => {
    const el = thumbnailRef.current?.children[currentSlide] as HTMLElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentSlide]);

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': case ' ': e.preventDefault(); goNext(); break;
        case 'ArrowLeft': e.preventDefault(); goPrev(); break;
        case 'Escape':
          if (isFullscreen) document.exitFullscreen?.();
          else onClose();
          break;
        case 'f': case 'F': toggleFullscreen(); break;
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, isFullscreen, onClose]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const downloadSlide = (index: number) => {
    if (!pageImages[index]) return;
    const link = document.createElement('a');
    link.href = pageImages[index];
    link.download = `${title}_slide_${index + 1}.png`;
    link.click();
  };

  const downloadAll = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `${title}.pdf`;
    link.target = '_blank';
    link.click();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed inset-0 z-[100] flex flex-col',
        isFullscreen ? 'bg-black' : 'bg-background'
      )}
    >
      {/* Toolbar */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2 border-b shrink-0',
        isFullscreen ? 'bg-black/90 border-white/10' : 'bg-card border-border'
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <h2 className={cn('text-sm font-semibold truncate max-w-[300px]', isFullscreen ? 'text-white' : 'text-foreground')}>{title}</h2>
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            isFullscreen ? 'bg-white/10 text-white/70' : 'bg-primary/10 text-primary'
          )}>
            {totalPages > 0 ? `${currentSlide + 1} / ${totalPages}` : '...'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => downloadSlide(currentSlide)} disabled={!pageImages[currentSlide]} title="Download this slide" className={cn(isFullscreen && 'text-white hover:bg-white/10')}>
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-xs">Slide</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadAll} title="Download all as PDF" className={cn(isFullscreen && 'text-white hover:bg-white/10')}>
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-xs">All PDF</span>
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="icon" variant="ghost" onClick={toggleFullscreen} className={cn(isFullscreen && 'text-white hover:bg-white/10')}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} className={cn(isFullscreen && 'text-white hover:bg-white/10')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className={cn('text-sm', isFullscreen ? 'text-white/60' : 'text-muted-foreground')}>Loading PDF pages...</p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Thumbnails sidebar */}
          <div
            ref={thumbnailRef}
            className={cn(
              'w-[180px] shrink-0 overflow-y-auto border-r p-3 space-y-3',
              isFullscreen ? 'bg-black/95 border-white/10' : 'bg-muted/20 border-border'
            )}
          >
            {pageImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={cn(
                  'w-full rounded-lg overflow-hidden transition-all duration-200 group',
                  i === currentSlide
                    ? 'ring-2 ring-primary shadow-lg shadow-primary/20 scale-[1.02]'
                    : 'ring-1 ring-border/50 hover:ring-primary/50 hover:shadow-md'
                )}
              >
                <div className="relative">
                  <img src={img} alt={`Page ${i + 1}`} className="w-full" />
                  {i === currentSlide && (
                    <div className="absolute inset-0 bg-primary/5" />
                  )}
                </div>
                <div className={cn(
                  'text-[11px] py-1 text-center font-medium transition-colors',
                  i === currentSlide
                    ? 'text-primary bg-primary/10'
                    : isFullscreen ? 'text-white/50 bg-white/5' : 'text-muted-foreground bg-muted/30'
                )}>
                  {i + 1}
                </div>
              </button>
            ))}
          </div>

          {/* Main slide view - fills remaining space */}
          <div className={cn(
            'flex-1 flex items-center justify-center relative overflow-hidden',
            isFullscreen ? 'bg-black' : 'bg-muted/10'
          )}>
            {/* Navigation arrows */}
            <Button
              size="icon"
              variant="secondary"
              className={cn(
                'absolute left-4 z-10 h-12 w-12 rounded-full shadow-xl transition-opacity',
                currentSlide === 0 ? 'opacity-0 pointer-events-none' : 'opacity-80 hover:opacity-100',
                isFullscreen && 'bg-white/10 hover:bg-white/20 text-white'
              )}
              onClick={goPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            {pageImages[currentSlide] && (
              <div className="flex items-center justify-center w-full h-full p-6">
                <img
                  key={currentSlide}
                  src={pageImages[currentSlide]}
                  alt={`Page ${currentSlide + 1}`}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-2xl animate-fade-in"
                  style={{ maxHeight: 'calc(100vh - 80px)' }}
                />
              </div>
            )}

            <Button
              size="icon"
              variant="secondary"
              className={cn(
                'absolute right-4 z-10 h-12 w-12 rounded-full shadow-xl transition-opacity',
                currentSlide === totalPages - 1 ? 'opacity-0 pointer-events-none' : 'opacity-80 hover:opacity-100',
                isFullscreen && 'bg-white/10 hover:bg-white/20 text-white'
              )}
              onClick={goNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
