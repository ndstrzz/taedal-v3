// src/lib/seo.ts
export type SEO = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "profile" | "article";
  canonical?: string;
};

export function updateSEO(meta: SEO) {
  const d = document;

  if (meta.title) {
    d.title = meta.title;
    setMeta("og:title", meta.title);
    setMeta("twitter:title", meta.title);
  }
  if (meta.description) {
    setNameMeta("description", meta.description);
    setMeta("og:description", meta.description);
    setMeta("twitter:description", meta.description);
  }
  if (meta.image) {
    setMeta("og:image", meta.image);
    setMeta("twitter:image", meta.image);
    setNameMeta("twitter:card", "summary_large_image");
  }
  if (meta.url) {
    setMeta("og:url", meta.url);
    if (meta.canonical) {
      setLink("canonical", meta.canonical);
    } else {
      setLink("canonical", meta.url);
    }
  }
  setMeta("og:type", meta.type || "website");
}

function setMeta(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setNameMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}
