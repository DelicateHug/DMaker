import { useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> {
  /** Container className applied to the wrapping div */
  containerClassName?: string;
  /** Whether to show a skeleton placeholder while loading (default: true) */
  showPlaceholder?: boolean;
  /** Whether to show an error icon when the image fails to load (default: true) */
  showErrorState?: boolean;
  /** Size of the error icon in tailwind classes (default: "w-4 h-4") */
  errorIconSize?: string;
}

export function LazyImage({
  src,
  alt,
  className,
  containerClassName,
  showPlaceholder = true,
  showErrorState = true,
  errorIconSize = 'w-4 h-4',
  ...props
}: LazyImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {status === 'loading' && showPlaceholder && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded" />
      )}
      {status === 'error' && showErrorState && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded">
          <ImageOff className={cn(errorIconSize, 'text-muted-foreground')} />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={cn(
          'transition-opacity duration-200',
          status === 'loaded' ? 'opacity-100' : 'opacity-0',
          className
        )}
        {...props}
      />
    </div>
  );
}
