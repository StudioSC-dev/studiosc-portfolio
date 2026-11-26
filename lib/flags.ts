/**
 * Rollout flags. While `rangeHome` is off, `/` keeps the old home and the
 * Range home is served only at `/preview/home` (noindex, unlinked). PRV-11
 * turns it on.
 */
export const flags: { readonly rangeHome: boolean } = {
  rangeHome: false,
};
