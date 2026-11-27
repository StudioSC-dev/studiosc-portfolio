import type { FragmentId } from "@/content/range";
import { centralCommand } from "./central-command";
import { formHelper } from "./form-helper";
import { habitTracker } from "./habit-tracker";
import { turntable } from "./turntable";
import type { Fragment } from "./types";

/**
 * The fragments built so far, by id. A plate whose fragment is missing here
 * draws only its frame and title; PRV-6 adds the rest.
 */
export const FRAGMENTS: Partial<Record<FragmentId, Fragment>> = {
  "central-command": centralCommand,
  "habit-tracker": habitTracker,
  "form-helper": formHelper,
  turntable,
};
