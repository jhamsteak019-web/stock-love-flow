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
  FileDown,
  Image,
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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [animKey, setAnimKey] = useState(0);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF via fetch (to avoid blocked direct URL issues)
  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setLoading(true);
        setLoadingProgress(0);

        // Fetch PDF as blob first
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Failed to fetch PDF');
        const blob = await response.blob();
        if (cancelled) return;
        setPdfBlob(blob);

        const arrayBuffer = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setTotalPages(doc.numPages);

        // Render pages with high quality
        const images: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 3 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(canvas.toDataURL('image/png'));
          if (cancelled) return;
          setLoadingProgress(Math.round((i / doc.numPages) * 100));
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
    if (currentSlide < totalPages - 1) {
      setSlideDirection('right');
      setAnimKey(k => k + 1);
      setCurrentSlide(prev => prev + 1);
    }
  }, [totalPages, currentSlide]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      setSlideDirection('left');
      setAnimKey(k => k + 1);
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);

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

  // Download single slide as PNG
  const downloadSlide = (index: number) => {
    if (!pageImages[index]) return;
    const link = document.createElement('a');
    link.href = pageImages[index];
    link.download = `${title}_page_${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download entire PDF from blob
  const downloadAll = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const progressPercent = totalPages > 0 ? ((currentSlide + 1) / totalPages) * 100 : 0;

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
            'text-xs px-2.5 py-1 rounded-full font-medium',
            isFullscreen ? 'bg-white/10 text-white/70' : 'bg-primary/10 text-primary'
          )}>
            {totalPages > 0 ? `${currentSlide + 1} / ${totalPages}` : '...'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadSlide(currentSlide)}
            disabled={!pageImages[currentSlide]}
            title="Download this page as image"
            className={cn('gap-1.5', isFullscreen && 'text-white hover:bg-white/10')}
          >
            <Image className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Page</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={downloadAll}
            disabled={!pdfBlob}
            title="Download full PDF"
            className={cn('gap-1.5', isFullscreen && 'text-white hover:bg-white/10')}
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">PDF</span>
          </Button>
          <div className={cn('w-px h-5 mx-1', isFullscreen ? 'bg-white/20' : 'bg-border')} />
          <Button size="icon" variant="ghost" onClick={toggleFullscreen} className={cn(isFullscreen && 'text-white hover:bg-white/10')}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} className={cn(isFullscreen && 'text-white hover:bg-white/10')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className={cn('h-0.5 shrink-0', isFullscreen ? 'bg-white/5' : 'bg-border/50')}>
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className={cn('text-sm font-medium', isFullscreen ? 'text-white/60' : 'text-muted-foreground')}>
            Loading pages... {loadingProgress}%
          </p>
          <div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${loadingProgress}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Full-width slide area */}
          <div className={cn(
            'flex-1 flex items-center justify-center relative min-h-0 min-w-0 p-0',
            isFullscreen ? 'bg-neutral-950' : 'bg-muted/5'
          )}>
            {/* Nav arrows */}
            <Button
              size="icon"
              variant="secondary"
              className={cn(
                'absolute left-4 z-10 h-12 w-12 rounded-full shadow-xl transition-all duration-200',
                currentSlide === 0 ? 'opacity-0 pointer-events-none scale-90' : 'opacity-70 hover:opacity-100 hover:scale-105',
                isFullscreen && 'bg-white/10 hover:bg-white/20 text-white'
              )}
              onClick={goPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            {/* Slide with animation */}
            {pageImages[currentSlide] && (
              <div
                key={animKey}
                className="flex items-center justify-center w-full h-full"
                style={{
                  animation: 'slidePresentation 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
                }}
              >
                <img
                  src={pageImages[currentSlide]}
                  alt={`Page ${currentSlide + 1}`}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            <Button
              size="icon"
              variant="secondary"
              className={cn(
                'absolute right-4 z-10 h-12 w-12 rounded-full shadow-xl transition-all duration-200',
                currentSlide === totalPages - 1 ? 'opacity-0 pointer-events-none scale-90' : 'opacity-70 hover:opacity-100 hover:scale-105',
                isFullscreen && 'bg-white/10 hover:bg-white/20 text-white'
              )}
              onClick={goNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}

      {/* CSS animation */}
      <style>{`
        @keyframes slidePresentation {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
