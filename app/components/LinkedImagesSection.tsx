import type { LinkedImage } from '@/lib/types';

export default function LinkedImagesSection({
  images,
}: {
  images: LinkedImage[];
}) {
  return (
    <section className="px-4 py-4 sm:px-5">
      <h3 className="mb-2 text-xs font-semibold uppercase text-ink/55">
        Rijksmuseum images ({images.length})
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((image) => {
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
    </section>
  );
}
