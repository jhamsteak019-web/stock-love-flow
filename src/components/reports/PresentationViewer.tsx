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

// Set worker
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
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setLoading(true);
        const doc = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);

        // Render all pages as images
        const images: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
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

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen?.();
          } else {
            onClose();
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
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
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Download single slide as PNG
  const downloadSlide = (index: number) => {
    if (!pageImages[index]) return;
    const link = document.createElement('a');
    link.href = pageImages[index];
    link.download = `${title}_slide_${index + 1}.png`;
    link.click();
  };

  // Download entire PDF
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
        isFullscreen ? 'bg-black/80 border-white/10' : 'bg-background/95 backdrop-blur-sm'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className={cn('text-sm font-medium truncate', isFullscreen && 'text-white')}>{title}</h2>
          <span className={cn('text-xs text-muted-foreground', isFullscreen && 'text-white/60')}>
            {totalPages > 0 ? `${currentSlide + 1} / ${totalPages}` : 'Loading...'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadSlide(currentSlide)}
            disabled={!pageImages[currentSlide]}
            title="Download this slide"
          >
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-xs">Slide</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={downloadAll}
            title="Download all as PDF"
          >
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-xs">All PDF</span>
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Thumbnails sidebar */}
          <div className={cn(
            'w-40 shrink-0 overflow-y-auto border-r p-2 space-y-2',
            isFullscreen ? 'bg-black/90 border-white/10' : 'bg-muted/30'
          )}>
            {pageImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={cn(
                  'w-full rounded-md overflow-hidden border-2 transition-all',
                  i === currentSlide
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-transparent hover:border-muted-foreground/30'
                )}
              >
                <img src={img} alt={`Slide ${i + 1}`} className="w-full" />
                <div className={cn(
                  'text-[10px] py-0.5 text-center font-medium',
                  isFullscreen ? 'text-white/70' : 'text-muted-foreground'
                )}>
                  {i + 1}
                </div>
              </button>
            ))}
          </div>

          {/* Main slide view */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'absolute left-2 z-10 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg',
                currentSlide === 0 && 'opacity-30 pointer-events-none'
              )}
              onClick={goPrev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            {pageImages[currentSlide] && (
              <img
                src={pageImages[currentSlide]}
                alt={`Slide ${currentSlide + 1}`}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl animate-fade-in"
              />
            )}

            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'absolute right-2 z-10 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg',
                currentSlide === totalPages - 1 && 'opacity-30 pointer-events-none'
              )}
              onClick={goNext}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
