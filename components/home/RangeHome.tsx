import { RANGE_CATEGORIES } from "@/content/range";
import { Opener } from "@/components/range/Opener";
import { Range } from "@/components/range/Range";
import { RangeSwitch } from "@/components/range/RangeSwitch";

/**
 * The Range home: the opener and the Range, sharing one selection. Served at
 * /preview/home while `flags.rangeHome` is off (lib/flags.ts).
 */
export default function RangeHome() {
  return (
    <RangeSwitch count={RANGE_CATEGORIES.length}>
      <Opener />
      <Range />
    </RangeSwitch>
  );
}
