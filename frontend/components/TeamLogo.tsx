import * as NBALogos from "react-nba-logos";

type LogoComponent = React.ComponentType<{ size?: number }>;

interface TeamLogoProps {
  team: string;
  size?: number;
}

/**
 * Renders an NBA team logo by abbreviation.
 * Falls back to team abbreviation text if logo not found.
 */
export function TeamLogo({ team, size = 24 }: TeamLogoProps) {
  const Logo = (NBALogos as Record<string, LogoComponent>)[team];

  if (!Logo) {
    return (
      <span
        className="inline-flex items-center justify-center text-muted-foreground text-xs"
        style={{ width: size, height: size }}
      >
        {team}
      </span>
    );
  }

  return <Logo size={size} />;
}
