// Lightweight head manager for per-page meta/OG tags.
// Call updateSEO(...) in useEffect when your data arrives.

type SEO = {
  title?: string;
  description?: string;
  image?: string;   // absolute URL preferred
  url?: string;     // absolute URL preferred
  type?: "website" | "article" | "profile";
};

function set(name: string, content?: string) {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setProperty(prop: string, content?: string) {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", prop);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function updateSEO({ title, description, image, url, type = "website" }: SEO) {
  if (title) document.title = title;
  set("description", description);

  // Open Graph
  setProperty("og:title", title);
  setProperty("og:description", description);
  setProperty("og:type", type);
  setProperty("og:url", url);
  setProperty("og:image", image);

  // Twitter
  set("twitter:card", image ? "summary_large_image" : "summary");
  set("twitter:title", title);
  set("twitter:description", description);
  set("twitter:image", image);
}
