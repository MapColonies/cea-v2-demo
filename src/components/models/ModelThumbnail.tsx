import { useState } from 'react';
import { Box } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

interface ModelThumbnailProps {
  model: Model;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ModelThumbnail({ model, size = 'sm', className = '' }: ModelThumbnailProps) {
  const [imageError, setImageError] = useState(false);

  // Calculate center coordinates
  const centerLat = model.center_lat ?? (Number(model.bbox_north) + Number(model.bbox_south)) / 2;
  const centerLng = model.center_lng ?? (Number(model.bbox_east) + Number(model.bbox_west)) / 2;

  // Size mapping
  const sizeMap = {
    sm: { width: 32, height: 32, zoom: 12, iconSize: 'w-4 h-4' },
    md: { width: 48, height: 48, zoom: 13, iconSize: 'w-5 h-5' },
    lg: { width: 64, height: 64, zoom: 14, iconSize: 'w-6 h-6' },
  };

  const { width, height, zoom, iconSize } = sizeMap[size];

  // Use OpenStreetMap static tile as thumbnail
  // This creates a simple satellite/map view based on coordinates
  const tileX = Math.floor((centerLng + 180) / 360 * Math.pow(2, zoom));
  const tileY = Math.floor((1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  
  const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;

  // If we have a custom thumbnail_url, use it
  const imageUrl = model.thumbnail_url || tileUrl;

  if (imageError) {
    return (
      <div 
        className={`bg-muted rounded-lg flex items-center justify-center shrink-0 ${className}`}
        style={{ width, height }}
      >
        <Box className={`${iconSize} text-muted-foreground`} />
      </div>
    );
  }

  return (
    <div 
      className={`rounded-lg overflow-hidden shrink-0 bg-muted ${className}`}
      style={{ width, height }}
    >
      <img
        src={imageUrl}
        alt={model.name}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
        loading="lazy"
      />
    </div>
  );
}