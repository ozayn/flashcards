import type { Metadata } from "next";
import { getBackendUrl } from "@/lib/backend-url";
import {
  DECK_METADATA_GENERIC_DESCRIPTION,
  DECK_METADATA_GENERIC_TITLE,
  DECK_METADATA_SITE_NAME,
  buildDeckMetadataDescription,
  buildDeckMetadataTitle,
  type DeckMetaShape,
} from "./deck-metadata";

/**
 * Server-only sibling layout for the (client) deck detail page. Exists so we can emit
 * per-deck Open Graph / Twitter metadata for link previews without converting the page
 * itself into a server component.
 *
 * Privacy: deck-specific fields are emitted ONLY for public decks (`is_public === true`).
 * For private / unknown / errored decks the response falls back to generic site metadata
 * and marks the page `noindex` so search engines and social crawlers do not cache a
 * preview built from leaked private information.
 */

/** Short timeout so a slow/down backend cannot stall page rendering for share previewers. */
const METADATA_FETCH_TIMEOUT_MS = 2500;

async function fetchDeckForMetadata(deckId: string): Promise<DeckMetaShape | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${getBackendUrl()}/decks/${encodeURIComponent(deckId)}`, {
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as DeckMetaShape;
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
  const deckUrl = `/decks/${encodeURIComponent(params.id)}`;

  /**
   * Future: when per-deck preview images become available, replace this with `[<deckImage>]`
   * so previews show deck-specific artwork; until then the parent layout's site icon is the
   * intentional default and is kept explicit here because Next.js does NOT deep-merge the
   * `openGraph` object across layouts (setting it here replaces the parent's openGraph).
   */
  const defaultImages = ["/icons/icon-512.png"];

  const deck = await fetchDeckForMetadata(params.id);
  const isShareable = Boolean(deck && deck.is_public);

  if (!isShareable) {
    return {
      title: DECK_METADATA_GENERIC_TITLE,
      description: DECK_METADATA_GENERIC_DESCRIPTION,
      alternates: { canonical: deckUrl },
      robots: { index: false, follow: false },
      openGraph: {
        type: "website",
        url: deckUrl,
        siteName: DECK_METADATA_SITE_NAME,
        title: DECK_METADATA_GENERIC_TITLE,
        description: DECK_METADATA_GENERIC_DESCRIPTION,
        images: defaultImages,
      },
      twitter: {
        card: "summary",
        title: DECK_METADATA_GENERIC_TITLE,
        description: DECK_METADATA_GENERIC_DESCRIPTION,
      },
    };
  }

  const title = buildDeckMetadataTitle(deck!);
  const description = buildDeckMetadataDescription(deck!);

  return {
    title,
    description,
    alternates: { canonical: deckUrl },
    openGraph: {
      type: "article",
      url: deckUrl,
      siteName: DECK_METADATA_SITE_NAME,
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

export default function DeckDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
