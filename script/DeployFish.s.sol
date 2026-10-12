// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FishNFT} from "../src/FishNFT.sol";

/// @notice Deploy a new FishNFT collection on Arc testnet. Profile, party, and FishDuel stay put.
/// @dev Chain id 5042002 only. Does not stamp one portrait over the per-tier models.
///      Upgrade, protocol, and season sinks reuse the team address.
contract DeployFish is Script {
    function run() external {
        if (block.chainid != 5042002) revert("arc: chain");
        address lp = vm.envAddress("LP_SINK");
        address team = vm.envAddress("TEAM_SINK");
        address burn = vm.envAddress("BURN_SINK");
        vm.startBroadcast();
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
        console2.log("FishNFT", address(nft));
    }
}
