import { Link } from "react-router-dom"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export interface BreadcrumbItemData {
  label: string
  /** When absent, the item renders as the current page (non-interactive). */
  to?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItemData[]
}

/**
 * Navigation breadcrumb for the app header. The last item is the current
 * page; earlier items link into the app.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <BreadcrumbItem key={item.label}>
              {!isLast && item.to ? (
                <BreadcrumbLink render={<Link to={item.to} />}>
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
              {!isLast ? <BreadcrumbSeparator /> : null}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}