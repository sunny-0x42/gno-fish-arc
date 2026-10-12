# Shoal on Arc testnet

Shoal is the FISH game on Arc testnet. Six contracts are on chain. Swimming and biting stay in the browser. The contracts take USDC for a mint, a stake, a signed kill, and a later leave. FISH is the ledger token. FishEarn pays it after a kill.

## The contracts

**FishDuel** is the duel. A player mints one fish, stakes native USDC, and sits in the sea. Two seated fish can settle one covered kill from signed samples. This contract is not the NFT collection.

**FishProfile** stores one sailor card per address: a username, a country, and a crest. It does not mint a fish.

**FishParty** is a crew list. A leader opens a named crew, invites addresses, and members join or leave. A crew holds no coins.

**FishNFT** is the fish collection. Mint, list, and buy move USDC. Swimming, biting, healing, upgrading, and laying eggs are not on this contract. The collection is not the fungible FISH token. A mint the play page sends costs 5 USDC. The player sends a name. Size is medium. Two coin flips climb one tier, and only two heads climb. Any other pair stops. The odds are Bubble 3/4, Tideblade 3/16, Abysswing 3/64, Embermaw 3/256, Aurelion 3/1024, and Astravex 1/1024. The next two bits roll the trait: swift 1/2, fang 1/4, hide 1/4. Swift also slips 2.4, hide slips 1.2, and fang slips 0.4. Hide HP is 112. The live fish-arc-5 collection stores that slip in tenths: 24, 12, and 4. The sea also applies the trait slip from the trait name. The token's image and animation URL are that tier's `.glb`. Block entropy is not a VRF. The sea still opens on a 1 USDC FishDuel stake. The swimmer wears the compressed model for that wallet's highest FishNFT tier, or Bubble when the wallet has none.

**FISH** is the ledger token. The supply is 100,000,000 with 6 decimals. Season holds 43,000,000, liquidity 20,000,000, ecosystem 15,000,000, community 12,000,000, public sale 5,000,000, and team 5,000,000. Ecosystem, community, public sale, and team sit on the team wallet. There is no further mint.

**FishEarn** pays a kill from the season allocation. The caller must own one seated FishDuel fish, and the other fish must be seated in the same open bout. The payout is 1 whole FISH per 1 whole USDC of the smaller stake, once per bout, after the bout has been open for 2400 ms. The call does not move USDC and does not send Settle. A party bonus stays in the browser.

FishProfile and FishParty move no USDC. A call that attaches value is rejected.

## Network

| | |
| --- | --- |
| Network | Arc Testnet |
| Chain id | `5042002` |
| RPC | `https://rpc.testnet.arc.io` |
| Fallback RPC | `https://rpc.testnet.arc.network` |
| Explorer | https://explorer.testnet.arc.io |
| Coin | Native USDC, 18 decimals |

`1e18` is 1 USDC. `1e6` is 1 FISH.

## Current deployment

The page in `web/src/chain/arc.ts` reads these addresses. Chain id `5042002`. Fish, stakes, crews, and sailor cards on the earlier deployment do not move. The fish-arc-5 collection starts empty.

| Contract | Version | Address | Deploy transaction |
| --- | --- | --- | --- |
| FishDuel | `fishduel-arc-2` | `0x2Cbb115ccb69c8bae2FB2FCdAa68B80dBa0d0670` | `0x2a97bc8a739ecd3a5cd263febd821ba41e8e4a4cf021cc30ca895cfa00bf99d6` |
| FishProfile | `profile-arc-2` | `0x6130bC38A58bd658c04152673d50C0339C86D6C3` | `0xdf2c216a63133b3c27000b2fb6eed61a81e569d4c2a95d863a60b62b0f7559b5` |
| FishParty | `party-arc-2` | `0x285F5345AD2f1421F53f29Fa1F3Cd77fef4e63Be` | `0x9cdf1f775e0cd26aee9e1b8092f852c3fab8b564d623543632c933f7558a920b` |
| FishNFT | `fish-arc-5` | `0x02081A2efBb0F14d4DEBfA5aa4D16E62E91373da` | `0x964e4d369bd1019f4106d9c00cd56e21374831dfe3e10f45ae1b39d831f36766` |
| FISH | `fishtoken-arc-1` | `0x0441c265496029829Ac79942dC917ECFdAb1d2a3` | `0xd13d1e6dfda0925b5c1d06eeaf1df51e94dcb40c4c9470482b26d733f9501421` |
| FishEarn | `fishearn-arc-1` | `0x7241E458Ed2ead6156045D61E6283Bda86A39293` | `0x6295094c1d82364fde975ce75a6ea8aeb3572c89021da883fe521825698f070f` |

## Earlier Arc deployment

| Contract | Version | Address | Deploy transaction |
| --- | --- | --- | --- |
| FishDuel | `fishduel-arc-1` | `0x55675f0415E8313F47cb290B874DCbC00cfd3642` | `0xe0f77f668f820a907b169055d18cee5cd4b2da45ae951238632de4bb7c50726a` |
| FishProfile | `profile-arc-1` | `0xa6a1CA3C1C6609Ae2223a66d8AC2eeF87Ec7aeBd` | `0x794e768669193b33199a5744ecebbbaba729e29c06fcd0a821330f42a395b587` |
| FishParty | `party-arc-1` | `0x337e25cA3C53E34B0FA49Ae2873d2dfE9F3001D6` | `0x5b5b1b54ce23d8ff78d22de7f38dd69e93ba7ad12bd768cd4f91426b2d5bb91b` |
| FishNFT | `fish-arc-4` | `0xAf52A0e0A9a82457D50Ad99858A9Ee60E566B5f3` | `0x654f5c016eb93a2883e22680940e4584f80296fff9e65b16d159a57ac0d4acfe` |
| FishNFT | `fish-arc-3` | `0xd2CA9224Ee155eb238D70b4AB469b8cf002c2c5A` | `0x6bfdaba91f61e3339640296e6c0385042724971332db18d0d1288a16519a7356` |
| FishNFT | `fish-arc-2` | `0x01C405f7b3E0B2A1f57d6AF1aD042b102e37a7dB` | `0xbf142d2dce3f40eb91c9bdd4113395ae0bcadbfb3159ac0d6d6f21b3910b9b4e` |
| FishNFT | `fish-arc-1` | `0x1C5Ef20E827b9EB4cd3bf5Ed3B0F732FA36fDD6f` | `0x3466675e35de29811277e2896d679e58977578ebcd4df06f84b0e16729fbcd61` |

`fish-arc-5` replaces the collection only. FishDuel, FishProfile, and FishParty stay at arc-2. Tokens minted on `fish-arc-4`, `fish-arc-3`, `fish-arc-2`, and `fish-arc-1` stay on those contracts. `fish-arc-4` had no tokens. Season FISH was released to FishEarn in `0x02ea1e8a15c33f72207808b8207612f447fda1e2c909293e10785ddba0063172`.

## Sinks

The three sinks are different addresses. On FishNFT, the upgrade, protocol, and season sinks are the team wallet, because only three sink addresses are set.

| Sink | Address | What it receives |
| --- | --- | --- |
| Team, also the deployer | `0x8EaAe9f664214987204616Dd8145BAcad48044F6` | 30% of the FishDuel mint fee, and 7% of a covered stake on a kill |
| Liquidity | `0xA7832aDE808De32006120237c5eE8d326612fac8` | 60% of the FishDuel mint fee, and 10% of a kill |
| Burn | `0x09ddE94a5E2F346dCD8678c6011e19bA962635c8` | 10% of the FishDuel mint fee, and 3% of a kill plus rounding dust |

## FishDuel rules

Mint costs exactly 1 USDC. The mint fee leaves the contract in that same call: 60% to liquidity, 30% to team, and 10% to burn.

A stake is at least 1 USDC. The roster holds at most 8 fish. Only 2 fish may be seated at once. There are no machine fish.

A kill pays from the smaller stake:

- 80% to the winner
- 10% to liquidity
- 3% to team
- 3% to burn
- 4% to cheer

This deployment has no cheer, so that 4% folds into team. Team therefore receives 7% of the covered stake. Rounding dust goes to burn. Any excess stake on the losing fish is returned to its owner. The winner's stake stays in the contract until that fish leaves.

`leave` returns the caller's stake. If the opponent is still seated, the caller waits 60 seconds.

## Signature

`register` binds a mark address. The mark may be the fish owner or a session key. That address must sign the samples.

A kill pack is six samples, winner then loser, three beats, joined by `/`. Each sample is:

`bout:seq:height:id:x:z:time:secret:sig`

`secret` is 32 lowercase hex characters. `sig` is 130 lowercase hex characters, `r || s || v`. The mark signs an EIP-191 message over `keccak256` of `canon`. `canon` is the decimal numbers joined by commas, with no leading zeros. The three samples are at least 2400 ms apart and sit on increasing blocks.

Damage for one hit is `floor(69 * 100 / (88 + 100))`, which is 36. The third hit must be the finishing blow.

## FishNFT

The play page sends a 5 USDC (`5e18`) mint to fish-arc-5. The FishDuel seat mint stays 1 USDC. `setMintFee` set the stored price to 5 USDC in transaction `0x5cf2244f5f47c7b4dd4205e81b399e4129e19af3e377f4b09f397c0422c395c1`. The minimum list is 10 USDC (`10e18`). A resale pays a 5% royalty (500 bps) to the deployer and a 2% protocol fee (200 bps).

The mint fee is split in the same call: 60% to the upgrade sink, 20% to liquidity, 10% to team, and the rest, including dust, to burn.

The play page mints and locks 1 USDC on FishDuel. It does not send Settle, List, or Buy. A kill of another seated fish sends Award to FishEarn. Each FishNFT image is that tier's model. This deploy does not call setArt.

## Tests

Install [Foundry](https://book.getfoundry.sh/getting-started/installation), then from the repo root:

```bash
forge install foundry-rs/forge-std@v1.17.0
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
forge test
```

`forge test` covers FishDuel, FishProfile, FishParty, FishNFT, FISH, and FishEarn, including mint fees, listings, stakes, duplicate names, party seats, and one FISH payout per open bout.

## Local page

The page is `web/`, at http://127.0.0.1:5183/. The Node binary is `/tmp/shoal-node/bin/node`. Start it with:

```bash
export PATH="/tmp/shoal-node/bin:$PATH"
cd web
/tmp/shoal-node/bin/node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5183
```

Swimming and biting stay in the browser. The wallet is `window.ethereum` on chain id `5042002`. Mint and lock each send exactly 1 USDC to FishDuel. Leave returns the stake. Saving a profile calls `setProfile` on FishProfile. Creating a party, inviting, and accepting call FishParty. Those profile and party calls send no USDC. A kill of another seated fish calls `award` on FishEarn. That call sends no USDC.
