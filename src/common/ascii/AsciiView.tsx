import { useEffect, useRef, type CSSProperties } from "react";
import { mount, type MountOptions } from "ascii.rest";
import type { Piece } from "ascii.rest";
import { Box } from "@mui/material";

interface AsciiViewProps {
  /** A piece (library namespace or composed kit piece). */
  piece: Piece;
  /** Option overrides passed to mount(); keep stable to avoid restarts. */
  options?: MountOptions;
  /** When set, exposes the drawing as an image with this name; hidden otherwise. */
  label?: string;
  className?: string;
  sx?: CSSProperties;
}

/**
 * Draws an ascii.rest piece into a <pre> host with mount(), imperatively and
 * outside React state. Text pieces follow currentColor, so they track the
 * theme; reduced-motion readers get the piece's held frame automatically.
 */
export const AsciiView = ({
  piece,
  options,
  label,
  className,
  sx,
}: AsciiViewProps) => {
  const ref = useRef<HTMLPreElement>(null);
  // An inline options object is new every render; only a real change restarts the piece.
  const key = JSON.stringify(options ?? {});

  useEffect(() => {
    if (!ref.current) return;
    return mount(ref.current, piece, JSON.parse(key));
  }, [piece, key]);

  return (
    <Box
      component="pre"
      ref={ref}
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      sx={{
        m: 0,
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: 1.2,
        whiteSpace: "pre",
        ...sx,
      }}
    />
  );
};
