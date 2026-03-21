import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize,
  Minimize,
  Edit3,
  Save,
  Plus,
  Trash2,
  FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Slide {
  title: string;
  content: string[];
  type: 'title' | 'content' | 'summary';
}

interface PresentationViewerProps {
  slides: Slide[];
  title: string;
  onClose: () => void;
  onSave: (slides: Slide[]) => void;
}

export const PresentationViewer = ({ slides: initialSlides, title, onClose, onSave }: PresentationViewerProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slides.length;

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isEditing) return;
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
  }, [goNext, goPrev, isFullscreen, isEditing, onClose]);

  // Listen for fullscreen changes
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

  const startEdit = () => {
    const slide = slides[currentSlide];
    setEditTitle(slide.title);
    setEditContent(slide.content.join('\n'));
    setIsEditing(true);
  };

  const saveEdit = () => {
    const updated = [...slides];
    updated[currentSlide] = {
      ...updated[currentSlide],
      title: editTitle,
      content: editContent.split('\n').filter(l => l.trim()),
    };
    setSlides(updated);
    setIsEditing(false);
    onSave(updated);
  };

  const addSlide = () => {
    const newSlide: Slide = { title: 'New Slide', content: ['Add your content here'], type: 'content' };
    const updated = [...slides];
    updated.splice(currentSlide + 1, 0, newSlide);
    setSlides(updated);
    setCurrentSlide(currentSlide + 1);
    onSave(updated);
  };

  const deleteSlide = () => {
    if (slides.length <= 1) return;
    const updated = slides.filter((_, i) => i !== currentSlide);
    setSlides(updated);
    setCurrentSlide(Math.min(currentSlide, updated.length - 1));
    onSave(updated);
  };

  const slide = slides[currentSlide];

  const slideColors = [
    'from-primary/10 to-primary/5',
    'from-blue-500/10 to-indigo-500/5',
    'from-emerald-500/10 to-teal-500/5',
    'from-amber-500/10 to-orange-500/5',
    'from-purple-500/10 to-pink-500/5',
  ];

  const getSlideGradient = (index: number) => slideColors[index % slideColors.length];

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed inset-0 z-[100] flex flex-col bg-background',
        isFullscreen && 'bg-black'
      )}
    >
      {/* Toolbar */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur-sm shrink-0',
        isFullscreen && 'bg-black/80 border-white/10'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className={cn('text-sm font-medium truncate', isFullscreen && 'text-white')}>{title}</h2>
          <span className={cn('text-xs text-muted-foreground', isFullscreen && 'text-white/60')}>
            {currentSlide + 1} / {totalSlides}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <>
              <Button size="icon" variant="ghost" onClick={startEdit} title="Edit slide">
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={addSlide} title="Add slide">
                <Plus className="h-4 w-4" />
              </Button>
              {slides.length > 1 && (
                <Button size="icon" variant="ghost" onClick={deleteSlide} title="Delete slide">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
          {isEditing && (
            <Button size="sm" onClick={saveEdit}>
              <Save className="h-4 w-4" /> Save
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden relative">
        {/* Navigation arrows */}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'absolute left-2 sm:left-6 z-10 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg',
            currentSlide === 0 && 'opacity-30 pointer-events-none'
          )}
          onClick={goPrev}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div
          className={cn(
            'w-full max-w-4xl aspect-[16/9] rounded-xl shadow-2xl overflow-hidden transition-all duration-500 ease-out bg-gradient-to-br border',
            getSlideGradient(currentSlide),
            isFullscreen && 'max-w-6xl border-white/10'
          )}
        >
          <div className="h-full flex flex-col justify-center p-8 sm:p-12 lg:p-16">
            {isEditing ? (
              <div className="space-y-4">
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="text-xl font-bold bg-background/50"
                  placeholder="Slide title"
                />
                <Textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="min-h-[200px] bg-background/50"
                  placeholder="One bullet point per line"
                />
              </div>
            ) : (
              <>
                {slide?.type === 'title' ? (
                  <div className="text-center space-y-4">
                    <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                      {slide.title}
                    </h1>
                    {slide.content?.length > 0 && (
                      <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
                        {slide.content[0]}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h2 className={cn(
                      'text-xl sm:text-2xl lg:text-3xl font-bold text-foreground',
                      slide?.type === 'summary' && 'text-primary'
                    )}>
                      {slide?.title}
                    </h2>
                    <ul className="space-y-3">
                      {slide?.content?.map((point, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-sm sm:text-base lg:text-lg text-foreground/90 animate-in fade-in slide-in-from-left-4"
                          style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
                        >
                          <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'absolute right-2 sm:right-6 z-10 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg',
            currentSlide === totalSlides - 1 && 'opacity-30 pointer-events-none'
          )}
          onClick={goNext}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Slide thumbnails */}
      <div className={cn(
        'flex gap-2 px-4 py-3 border-t overflow-x-auto bg-background/95 backdrop-blur-sm shrink-0',
        isFullscreen && 'bg-black/80 border-white/10'
      )}>
        {slides.map((s, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            className={cn(
              'shrink-0 w-20 h-12 rounded-md border-2 flex items-center justify-center text-[10px] font-medium transition-all px-1 truncate',
              i === currentSlide
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {i + 1}. {s.title?.substring(0, 12)}
          </button>
        ))}
      </div>
    </div>
  );
};
