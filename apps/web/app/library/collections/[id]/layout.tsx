import type { Metadata } from "next";
import { getBackendUrl } from "@/lib/backend-url";
import {
  COLLECTION_METADATA_GENERIC_DESCRIPTION,
  COLLECTION_METADATA_GENERIC_TITLE,
  COLLECTION_METADATA_SITE_NAME,
  buildCollectionMetadataDescription,
  buildCollectionMetadataTitle,
  type CollectionMetaShape,
} from "./collection-metadata";

/**
 * Server-only sibling layout for the (client) library-collection detail page. Exists so
 * we can emit per-collection Open Graph / Twitter metadata for link previews without
 * converting the page itself into a server component.
 *
 * Visibility: the backend's public `GET /library-collections/{id}` returns 404 for any
 * collection that is not `is_published = true`. We rely on that: an unpublished /
 * missing / errored response falls back to generic site metadata AND marks the page
 * `noindex` so crawlers (and previewers) never cache a draft preview.
 */

/** Short timeout so a slow/down backend cannot stall page rendering for share previewers. */
const METADATA_FETCH_TIMEOUT_MS = 2500;

async function fetchCollectionForMetadata(
  collectionId: string,
): Promise<CollectionMetaShape | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${getBackendUrl()}/library-collections/${encodeURIComponent(collectionId)}`,
      {
        signal: controller.signal,
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as CollectionMetaShape;
    if (!json || typeof json !== "object" || !json.id) return null;
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const collectionUrl = `/library/collections/${encodeURIComponent(params.id)}`;

  /**
   * Future: when per-collection preview images become available, replace this with
   * `[<collectionImage>]` so previews show collection-specific artwork. Until then the
   * parent layout's site icon is the intentional default and is kept explicit here
   * because Next.js does NOT deep-merge the `openGraph` object across layouts (setting
   * it here replaces the parent's openGraph).
   */
  const defaultImages = ["/icons/icon-512.png"];

  const collection = await fetchCollectionForMetadata(params.id);
  /**
   * The public detail endpoint already 404s for unpublished collections, so any non-null
   * response here is by definition shareable. The explicit `is_published` check is
   * defensive: should the backend ever start returning drafts to non-admins, we still
   * fall back to the generic preview here.
   */
  const isShareable = Boolean(collection && collection.is_published !== false);

  if (!isShareable) {
    return {
      title: COLLECTION_METADATA_GENERIC_TITLE,
      description: COLLECTION_METADATA_GENERIC_DESCRIPTION,
      alternates: { canonical: collectionUrl },
      robots: { index: false, follow: false },
      openGraph: {
        type: "website",
        url: collectionUrl,
        siteName: COLLECTION_METADATA_SITE_NAME,
        title: COLLECTION_METADATA_GENERIC_TITLE,
        description: COLLECTION_METADATA_GENERIC_DESCRIPTION,
        images: defaultImages,
      },
      twitter: {
        card: "summary",
        title: COLLECTION_METADATA_GENERIC_TITLE,
        description: COLLECTION_METADATA_GENERIC_DESCRIPTION,
      },
    };
  }

  const title = buildCollectionMetadataTitle(collection!);
  const description = buildCollectionMetadataDescription(collection!);

  return {
    title,
    description,
    alternates: { canonical: collectionUrl },
    openGraph: {
      type: "website",
      url: collectionUrl,
      siteName: COLLECTION_METADATA_SITE_NAME,
      title,
      description,
      images: defaultImages,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function LibraryCollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
