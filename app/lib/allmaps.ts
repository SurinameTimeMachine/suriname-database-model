type Annotation = {
  target?: { source?: { id?: string } };
};

type AnnotationDocument = Annotation | { items?: Annotation[] };
const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The map service request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function annotationItems(document: AnnotationDocument): Annotation[] {
  if ('items' in document) return document.items ?? [];
  return [document as Annotation];
}

function infoUrl(imageService: string) {
  return imageService.endsWith('/info.json')
    ? imageService
    : `${imageService}/info.json`;
}

/**
 * Allmaps fetches IIIF image metadata internally. A source service can be
 * removed while its Allmaps annotation remains available; verify the service
 * first so a 404 does not escape from the renderer as an unhandled rejection.
 */
export async function loadAllmapsAnnotation(annotationUrl: string) {
  const annotationResponse = await fetchWithTimeout(annotationUrl);
  if (!annotationResponse.ok) {
    throw new Error('The map annotation is unavailable.');
  }

  const document = (await annotationResponse.json()) as AnnotationDocument;
  const annotations = annotationItems(document);
  const sourceUrls = [
    ...new Set(
      annotations
        .map((annotation) => annotation.target?.source?.id)
        .filter((source): source is string => Boolean(source)),
    ),
  ];
  if (sourceUrls.length === 0) {
    throw new Error('The map annotation has no image service.');
  }

  const responses = await Promise.all(
    sourceUrls.map((source) => fetchWithTimeout(infoUrl(source))),
  );
  if (
    responses.some(
      (response) =>
        !response.ok || !response.headers.get('content-type')?.includes('json'),
    )
  ) {
    throw new Error('The map image service is currently unavailable.');
  }

  return document;
}
