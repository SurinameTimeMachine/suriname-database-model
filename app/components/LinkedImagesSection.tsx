import { useEffect, useState } from 'react';
import type { LinkedImage } from '@/lib/types';

const INITIAL_IMAGE_COUNT = 10;

export default function LinkedImagesSection({
  images,
}: {
  images: LinkedImage[];
}) {
  const [expanded, setExpanded] = useState(false);
  // Reset to truncated view whenever a different organization's images load.
  // Without this, expanding once keeps every subsequently selected org
  // expanded (same mounted component, new props) — appearing as "no truncation".
  useEffect(() => {
    setExpanded(false);
  }, [images]);
  const truncated = images.length > INITIAL_IMAGE_COUNT;
  const visible = expanded || !truncated ? images : images.slice(0, INITIAL_IMAGE_COUNT);
  return (
    <section className="px-4 py-4 sm:px-5">
      <h3 className="mb-2 text-xs font-semibold uppercase text-ink/55">
        Rijksmuseum images ({images.length})
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visible.map((image) => {
          const href = image.sameAs ?? image.contentUrl ?? undefined;
          return (
            <a
              key={`image-${image.id}`}
              href={href}
              {...(href
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className="block border border-ink/10 bg-white text-xs hover:border-teal-strong"
            >
              {image.thumbnailUrl && (
                <img
                  src={image.thumbnailUrl}
                  alt={image.label ?? image.objectNumber ?? 'Rijksmuseum image'}
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
              )}
              <div className="p-1.5">
                <p className="line-clamp-2 text-ink/80">{image.label}</p>
                <p className="mt-0.5 text-ink/45">
                  {image.year ?? 'undated'}
                  {image.licenseLabel ? ` \u00b7 ${image.licenseLabel}` : ''}
                </p>
              </div>
            </a>
          );
        })}
      </div>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 px-3 py-1.5 text-xs font-semibold text-teal-strong transition-colors hover:bg-teal-soft/25 focus:outline-none focus:ring-2 focus:ring-teal-bright/50"
        >
          {expanded
            ? 'Show fewer images'
            : `Show ${images.length - INITIAL_IMAGE_COUNT} more images`}
        </button>
      )}
    </section>
  );
}
