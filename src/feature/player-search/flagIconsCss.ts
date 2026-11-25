/**
 * Lazy loader for the `flag-icons` stylesheet.
 *
 * The stylesheet is ~420 kB (~86 kB gzipped) because most flags are embedded
 * in it as data URIs, yet flags only appear after a player search (search
 * candidates and the profile card). Importing it statically would force every
 * visitor to download it as part of the initial CSS bundle, so it is fetched
 * on first use instead and shared through a single in-flight request.
 */
let flagIconsCssRequest: Promise<void> | null = null;

export const ensureFlagIconsCss = (): Promise<void> => {
  flagIconsCssRequest ??= import("flag-icons/css/flag-icons.min.css").then(
    () => undefined,
    () => {
      // A failed fetch must not break the search UI (flags simply stay
      // unstyled); clear the cached request so the next call can retry.
      flagIconsCssRequest = null;
    },
  );
  return flagIconsCssRequest;
};
