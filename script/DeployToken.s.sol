// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FishEarn} from "../src/FishEarn.sol";
import {FishToken} from "../src/FishToken.sol";

/// @notice Deploy FISH and FishEarn on Arc testnet. FishDuel, profile, party, and FishNFT stay put.
/// @dev Chain id 5042002 only. Season FISH moves to FishEarn in this broadcast.
contract DeployToken is Script {
    address internal constant DUEL = 0x2Cbb115ccb69c8bae2FB2FCdAa68B80dBa0d0670;
    address internal constant LP = 0xA7832aDE808De32006120237c5eE8d326612fac8;
    address internal constant TEAM = 0x8EaAe9f664214987204616Dd8145BAcad48044F6;

    function run() external {
        if (block.chainid != 5042002) revert("arc: chain");
        if (vm.envAddress("LP_SINK") != LP || vm.envAddress("TEAM_SINK") != TEAM) revert("arc: sink");
        vm.startBroadcast();
        FishToken token = new FishToken(LP, TEAM);
        FishEarn earn = new FishEarn(token, DUEL);
        token.releaseSeason(address(earn));
        vm.stopBroadcast();
        console2.log("FishToken", address(token));
        console2.log("FishEarn", address(earn));
    }
}
