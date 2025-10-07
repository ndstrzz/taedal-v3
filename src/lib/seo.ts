// src/lib/seo.ts
type SEOArgs = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "profile" | string;
  twitterCard?: "summary" | "summary_large_image";
};

function upsertMeta(selector: string, attr: "content" | "href", value: string) {
  if (!value) return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    if (selector.startsWith('meta[')) {
      el = document.createElement("meta");
      // pull the key from selector e.g. meta[name="description"]
      const m = selector.match(/meta\[(name|property)=\"([^\"]+)\"\]/);
      if (m) el.setAttribute(m[1], m[2]);
      document.head.appendChild(el);
    } else if (selector.startsWith('link[')) {
      const link = document.createElement("link");
      const m = selector.match(/link\[(rel)=\"([^\"]+)\"\]/);
      if (m) link.setAttribute(m[1], m[2]);
      document.head.appendChild(link);
      (el as any) = link;
    }
  }
  if (!el) return;
  // @ts-ignore: link uses href
  el.setAttribute(attr, value);
}

/** Lightweight SEO/OG updater for client-side routes. */
export function updateSEO({
  title,
  description,
  image,
  url,
  type = "website",
  twitterCard = "summary_large_image",
}: SEOArgs) {
  if (title) document.title = title;

  if (description) {
    upsertMeta('meta[name="description"]', "content", description);
    upsertMeta('meta[property="og:description"]', "content", description);
    upsertMeta('meta[name="twitter:description"]', "content", description);
  }

  if (title) {
    upsertMeta('meta[property="og:title"]', "content", title);
    upsertMeta('meta[name="twitter:title"]', "content", title);
  }

  if (type) upsertMeta('meta[property="og:type"]', "content", type);
  if (url) upsertMeta('meta[property="og:url"]', "content", url);

  if (image) {
    upsertMeta('meta[property="og:image"]', "content", image);
    upsertMeta('meta[name="twitter:image"]', "content", image);
    upsertMeta('meta[name="twitter:card"]', "content", twitterCard);
  }

  // canonical link (optional, only if url provided)
  if (url) upsertMeta('link[rel="canonical"]', "href", url);
}
