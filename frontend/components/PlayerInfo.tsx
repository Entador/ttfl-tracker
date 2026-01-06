import Link from "next/link";

import { TeamLogo } from "@/components/TeamLogo";

interface PlayerInfoProps {
  playerId: number;
  name: string;
  team: string;
  logoSize?: number;
}

/**
 * Displays player info with team logo and name.
 * Uses TeamLogo which falls back to team abbreviation if logo not found.
 */
export function PlayerInfo({
  playerId,
  name,
  team,
  logoSize = 32,
}: PlayerInfoProps) {
  return (
    <Link
      href={`/players/${playerId}`}
      className="flex items-center gap-1 hover:underline"
    >
      <TeamLogo team={team} size={logoSize} />
      <span className="font-medium">{name}</span>
    </Link>
  );
}
