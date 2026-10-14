export interface RouterLike {
  canGoBack(): boolean;
  back(): void;
  replace(href: string): void;
}

/**
 * Navigate back if possible, or replace with fallback route (default: "/").
 */
export function goBackOr(router: RouterLike, fallback = "/"): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
