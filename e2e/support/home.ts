import { flags } from "../../lib/flags";

/**
 * Where specs reach the Range home: /preview/home while `rangeHome` is off,
 * and / once PRV-11 turns it on.
 */
export const HOME_ROUTE = flags.rangeHome ? "/" : "/preview/home";
