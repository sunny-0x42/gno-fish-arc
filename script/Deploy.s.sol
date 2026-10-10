// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FishDuel} from "../src/FishDuel.sol";

/// @notice Deploy FishDuel to Arc testnet only. Chain id 5042002.
contract Deploy is Script {
    function run() external {
        if (block.chainid != 5042002) revert("FishDuel: wrong chain");
        address lp = vm.envAddress("LP_SINK");
        address crew = vm.envAddress("TEAM_SINK");
        address ash = vm.envAddress("BURN_SINK");
        vm.startBroadcast();
        FishDuel duel = new FishDuel(lp, crew, ash);
        vm.stopBroadcast();
        console2.log("FishDuel", address(duel));
    }
}
