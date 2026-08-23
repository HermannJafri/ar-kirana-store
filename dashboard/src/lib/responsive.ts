"use client";

import { Grid } from "antd";

// Wraps antd's own breakpoint hook (md = 768px, antd's standard cutoff)
// rather than a custom media query, so every page agrees on exactly where
// "mobile" starts and stays in sync with any other antd breakpoint usage.
export function useIsMobile(): boolean {
  const screens = Grid.useBreakpoint();
  return screens.md === false;
}
