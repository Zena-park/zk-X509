"use client";

import { useState } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChainName } from "@/lib/wallet";
import { isSafeListingUrl, normalizeAccent, type CardAnimation, type CardFont, type CardStyle, type Project, type ProjectStatus } from "./projects";

const STATUS_STYLES: Record<ProjectStatus, { dot: string; label: string; text: string }> = {
  live: { dot: "bg-secondary", label: "Live", text: "text-secondary" },
  building: { dot: "bg-amber-400", label: "Building", text: "text-amber-400" },
};

// Card text font → an app font class. Fixed set (no arbitrary font-family), so
// a listing can never inject CSS via the font field.
const FONT_CLASS: Record<CardFont, string> = {
  grotesk: "font-headline",
  sans: "font-body",
  mono: "font-mono",
};

/** Append a 2-hex-digit alpha to a normalized #rrggbb color. */
const alpha = (hex: string, aa: string) => `${hex}${aa}`;

/**
 * Hover effect keyed by the project's `animation` choice. Applied via
 * `whileHover` (a single settle on hover, reverting on leave) — NOT an infinite
 * loop, so idle cards don't repaint every frame.
 */
function hoverEffect(animation: CardAnimation, accent?: string): TargetAndTransition | undefined {
  const transition = { duration: 0.3, ease: "easeOut" } as const;
  switch (animation) {
    case "float":
      return { y: -8, transition };
    case "pulse":
      return { scale: 1.03, transition };
    case "glow": {
      const c = accent ?? "#6b5bff";
      return { boxShadow: `0 0 30px ${alpha(c, "73")}`, transition };
    }
    default:
      return undefined;
  }
}

/** Per-template card background, tinted by the accent when present. */
function cardBackground(style: CardStyle, accent?: string): React.CSSProperties {
  const c = accent ?? "#6b5bff";
  switch (style) {
    case "gradient":
      return {
        backgroundImage: `linear-gradient(135deg, ${alpha(c, "2e")} 0%, ${alpha(c, "0a")} 38%, transparent 70%)`,
        borderColor: accent ? alpha(c, "3a") : undefined,
      };
    case "bold":
      return {
        backgroundColor: alpha(c, "16"),
        backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${alpha(c, "3a")}, transparent 55%)`,
        borderColor: accent ? alpha(c, "55") : undefined,
      };
    case "minimal":
      return {
        // a slim accent edge instead of a fill
        boxShadow: `inset 3px 0 0 ${alpha(c, "cc")}`,
        borderColor: accent ? alpha(c, "22") : undefined,
      };
    case "classic":
    default:
      return {
        backgroundImage: `radial-gradient(90% 70% at 100% 0%, ${alpha(c, "1f")}, transparent 55%)`,
        borderColor: accent ? alpha(c, "33") : undefined,
      };
  }
}

function LogoTile({
  project,
  accent,
  size,
}: {
  project: Project;
  accent?: string;
  size: "sm" | "lg";
}) {
  const dim = size === "lg" ? "w-14 h-14 text-2xl rounded-2xl" : "w-11 h-11 text-lg rounded-xl";
  const [broken, setBroken] = useState(false);
  // Only render the logo if it's a safe URL and hasn't failed to load; otherwise
  // fall back to the project's initial.
  const showLogo = project.logo && isSafeListingUrl(project.logo) && !broken;
  return (
    <div
      className={cn(
        "flex items-center justify-center font-headline font-bold overflow-hidden shrink-0",
        dim,
        !accent && "bg-tertiary/10 text-tertiary"
      )}
      style={accent ? { backgroundColor: alpha(accent, "22"), color: accent } : undefined}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.logo}
          alt={`${project.name} logo`}
          className="w-full h-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        project.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

export function ProjectCard({ project, index }: { project: Project; index: number }) {
  const [bgBroken, setBgBroken] = useState(false);
  const accent = normalizeAccent(project.accent);
  const style: CardStyle = project.cardStyle ?? "classic";
  const status = STATUS_STYLES[project.status];
  const isBold = style === "bold";
  // Only link out to a safe URL — never render an unsafe scheme into href.
  const url = isSafeListingUrl(project.url) ? project.url : undefined;
  // Background image only from a safe URL; rendered as an <img> (no CSS
  // injection) behind a readability overlay.
  const background = isSafeListingUrl(project.background) ? project.background : undefined;
  const fontClass = FONT_CLASS[project.font ?? "grotesk"];

  // Per-template container treatment. The background/border come from
  // cardBackground() (accent-tinted inline style); the base class handles the
  // glass surface and padding so each template reads distinctly.
  const isMinimal = style === "minimal";
  const containerClass = cn(
    "relative h-full rounded-2xl border overflow-hidden transition-colors",
    fontClass,
    isMinimal ? "p-5" : "p-6",
    isMinimal ? "bg-surface-container border-outline-variant/15" : "glass-panel border-outline-variant/10"
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="h-full"
    >
      <motion.div whileHover={hoverEffect(project.animation ?? "none", accent)} className="h-full rounded-2xl">
        <CardWrapper url={url}>
          <div className={containerClass} style={cardBackground(style, accent)}>
            {background && !bgBroken && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={background}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  onError={() => setBgBroken(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Readability overlay so text stays legible over any image */}
                <div className="absolute inset-0 bg-surface/82" />
              </>
            )}
            <div className="relative">
              <div className="flex items-start gap-3 mb-3">
                <LogoTile project={project} accent={accent} size={isBold ? "lg" : "sm"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-on-surface truncate">{project.name}</h3>
                    {url && (
                      <ArrowUpRight className="w-4 h-4 shrink-0 text-on-surface-variant group-hover:text-tertiary transition-colors" />
                    )}
                  </div>
                  {project.audience && (
                    <p className="text-xs text-on-surface-variant/70 font-label">
                      For <span className="text-on-surface">{project.audience}</span>
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-on-surface-variant leading-relaxed mb-4">{project.description}</p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-label mr-1">
                  <span className={cn("w-2 h-2 rounded-full", status.dot)} />
                  <span className={status.text}>{status.label}</span>
                </span>
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[10px] font-label uppercase tracking-wider border",
                    !accent && "bg-tertiary/10 border-tertiary/20 text-tertiary"
                  )}
                  style={accent ? { backgroundColor: alpha(accent, "1f"), borderColor: alpha(accent, "44"), color: accent } : undefined}
                >
                  {project.category}
                </span>
                {project.chains.map((id) => (
                  <span
                    key={id}
                    className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/15 text-on-surface-variant text-[10px] font-label"
                  >
                    {getChainName(id)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardWrapper>
      </motion.div>
    </motion.div>
  );
}

function CardWrapper({ url, children }: { url?: string; children: React.ReactNode }) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="group block h-full">
        {children}
      </a>
    );
  }
  return <div className="group h-full">{children}</div>;
}
