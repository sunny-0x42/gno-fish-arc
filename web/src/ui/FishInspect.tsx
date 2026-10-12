import { SPECIES, type Rarity } from "../sim/catalog";
import type { Trait } from "../sim/tokenomics";
import type { FishSize } from "../world/createFish";
import { FishPreview } from "../world/FishPreview";

export type InspectFish = { rarity: Rarity; size: FishSize; trait?: Trait; name?: string; image?: string };

export function FishInspect({ fish, onClose }: { fish: InspectFish; onClose: () => void }) {
  const species = SPECIES[fish.rarity];
  return (
    <aside id="fish-inspect" className="card fish-inspect" role="dialog" aria-labelledby="fish-inspect-title" tabIndex={-1} data-gameplay-blocking="true">
      <header className="fish-inspect-header">
        <div className="fish-inspect-copy">
          <p className="kicker">Inspect fish</p>
          <h2 id="fish-inspect-title">{fish.name || species.species}</h2>
          <p>{species.species} · {fish.rarity} · {typeof fish.size === "number" ? `Scale ${fish.size}` : fish.size}{fish.trait ? ` · ${fish.trait}` : ""}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close fish inspection">Close</button>
      </header>
      {fish.image ? <img className="nft-portrait" src={fish.image} alt={fish.name || "Shoal fish"} /> : <FishPreview rarity={fish.rarity} size={fish.size} trait={fish.trait} className="fish-inspect-preview" interactive />}
    </aside>
  );
}
