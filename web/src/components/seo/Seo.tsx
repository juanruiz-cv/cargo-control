import { useEffect } from "react"
import { useLocation } from "react-router-dom"

import { DEFAULT_DESCRIPTION, PUBLIC_SEO, SITE_URL } from "@/config/seo"

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  )
  if (!el) {
    el = document.createElement("meta")
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute("content", content)
}

function upsertCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="canonical"]`)
  if (!href) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement("link")
    el.setAttribute("rel", "canonical")
    document.head.appendChild(el)
  }
  el.setAttribute("href", href)
}

/**
 * Route-scoped document head (T16, responsive/SEO doctrine):
 * - Routes declared in PUBLIC_SEO → index,follow + title/description/
 *   canonical/og:url for that route.
 * - EVERY other route → noindex,nofollow and no canonical (fail-closed:
 *   index.html ships noindex as the static default for no-JS crawlers;
 *   this component is the JS-crawler equivalent).
 * Mounted ONCE at the router root so no route can keep a previous
 * route's indexable state. og:image is intentionally omitted until a
 * raster (PNG/JPG) brand asset exists — SVG favicons are not accepted
 * by social scrapers.
 */
export function Seo() {
  const { pathname } = useLocation()

  useEffect(() => {
    const page = PUBLIC_SEO[pathname]
    const title = page?.title ?? "Cargo Control"
    const description = page?.description ?? DEFAULT_DESCRIPTION

    document.title = title
    upsertMeta("name", "description", description)
    upsertMeta("name", "robots", page ? "index, follow" : "noindex, nofollow")
    upsertMeta("property", "og:title", title)
    upsertMeta("property", "og:description", description)
    upsertMeta("property", "og:site_name", "Cargo Control")
    upsertMeta("property", "og:type", "website")

    if (page) {
      const url = SITE_URL + pathname
      upsertCanonical(url)
      upsertMeta("property", "og:url", url)
    } else {
      upsertCanonical(null)
      document.head
        .querySelector('meta[property="og:url"]')
        ?.remove()
    }

    // Fail-closed restore when leaving the tree entirely.
    return () => {
      upsertMeta("name", "robots", "noindex, nofollow")
    }
  }, [pathname])

  return null
}
