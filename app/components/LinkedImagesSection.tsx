'use client';

import { useEffect, useState } from 'react';
import type { LinkedImage } from '@/lib/types';

const INITIAL_IMAGE_COUNT = 10;

export default function LinkedImagesSection({
  images,
  title = 'Rijksmuseum images',
  variant = 'panel',
}: {
  images: LinkedImage[];
  /** Section heading; the image count is appended. */
  title?: string;
  /** 'panel' for the organization side panel, 'record' for authority record pages. */
  variant?: 'panel' | 'record';
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
    <section
      className={
        variant === 'record'
          ? 'mt-10 border-t border-ink/10 pt-6'
          : 'px-4 py-4 sm:px-5'
      }
    >
      {variant === 'record' ? (
        <h2 className="mb-3 text-xl font-semibold">
          {title} ({images.length})
        </h2>
      ) : (
        <h3 className="mb-2 text-xs font-semibold uppercase text-ink/55">
          {title} ({images.length})
        </h3>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visible.map((image) => {
          const href = image.url ?? image.sameAs ?? image.contentUrl ?? undefined;
          const sourceLabel = image.source ?? 'Rijksmuseum';
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
                  alt={image.label ?? image.objectNumber ?? `${sourceLabel} image`}
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
                <p className="text-ink/45">
                  {sourceLabel}
                  {image.creator && image.creator.length > 0
                    ? ` \u00b7 ${image.creator.join(', ')}`
                    : ''}
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
