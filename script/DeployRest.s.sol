// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FishNFT} from "../src/FishNFT.sol";
import {FishParty} from "../src/FishParty.sol";
import {FishProfile} from "../src/FishProfile.sol";

/// @notice Deploy FishProfile, FishParty, and FishNFT on Arc testnet.
/// @dev Chain id 5042002 only. Deploy FishDuel with Deploy.s.sol in the same release.
///      Upgrade, protocol, and season sinks reuse the team address until separate treasuries exist.
///      This script does not deploy a FISH ledger token.
contract DeployRest is Script {
    function run() external {
        if (block.chainid != 5042002) revert("arc: chain");
        address lp = vm.envAddress("LP_SINK");
        address team = vm.envAddress("TEAM_SINK");
        address burn = vm.envAddress("BURN_SINK");
        vm.startBroadcast();
        FishProfile profile = new FishProfile();
        FishParty party = new FishParty();
        profile.claimAdmin();
        party.claimAdmin();
        FishNFT nft = new FishNFT(
            "Shoal Fish",
            "FISH",
            "https://shoal.example/art",
            500,
            team,
            lp,
            burn,
            team,
            team,
            team
        );
        vm.stopBroadcast();
        console2.log("FishProfile", address(profile));
        console2.log("FishParty", address(party));
        console2.log("FishNFT", address(nft));
    }
}
