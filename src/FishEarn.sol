// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FishToken} from "./FishToken.sol";

/// @title FishEarn
/// @author Shoal
/// @notice Pays FISH from the season allocation when two FishDuel fish are seated.
/// @dev One payment per open bout. 1 whole FISH per 1 whole USDC of the smaller stake.
///      This contract does not see the swim and does not move USDC. FishDuel settle stays separate.
interface IFishDuel {
    function ownerOf(uint256 id) external view returns (address);
    function inSea(uint256 id) external view returns (bool);
    function poolOf(uint256 id) external view returns (uint256);
    function ended(uint256 id) external view returns (bool);
    function boutOpen() external view returns (bool);
    function openBout() external view returns (uint256);
    function seatMilli() external view returns (uint256);
}

contract FishEarn is ReentrancyGuard {
    uint256 public constant USDC = 1e18;
    uint256 public constant FISH_UNIT = 1e6;
    uint256 public constant SEAT_GAP = 2_400;

    FishToken public immutable fish;
    IFishDuel public immutable duel;

    mapping(uint256 bout => bool paid) public paid;

    event Awarded(uint256 indexed bout, uint256 indexed id, uint256 indexed target, address killer, uint256 amount);

    error Addr();
    error Closed();

    /// @param fishToken FISH ledger that holds the season allocation.
    /// @param duel_ Live FishDuel. This contract only reads it.
    constructor(FishToken fishToken, address duel_) {
        if (address(fishToken) == address(0) || duel_ == address(0) || address(fishToken) == duel_) revert Addr();
        fish = fishToken;
        duel = IFishDuel(duel_);
    }

    /// @notice Pay the caller for one open bout. `id` is the caller's seated fish. `target` is the other.
    /// @dev The bout must have been open for at least 2400 ms. A second call for that bout reverts.
    ///      A short season balance pays what is left. A zero payment reverts and leaves the bout unpaid.
    function award(uint256 id, uint256 target) external nonReentrant {
        if (id == target || !duel.boutOpen()) revert Closed();
        if (duel.ownerOf(id) != msg.sender || duel.ownerOf(target) == msg.sender) revert Closed();
        if (!duel.inSea(id) || !duel.inSea(target) || duel.ended(id) || duel.ended(target)) revert Closed();
        uint256 bout = duel.openBout();
        if (bout == 0 || paid[bout]) revert Closed();
        if (block.timestamp * 1000 < duel.seatMilli() + SEAT_GAP) revert Closed();
        uint256 poolA = duel.poolOf(id);
        uint256 poolB = duel.poolOf(target);
        if (poolA < USDC || poolB < USDC) revert Closed();
        uint256 covered = poolA < poolB ? poolA : poolB;
        uint256 pay = (covered / USDC) * FISH_UNIT;
        uint256 bal = fish.balanceOf(address(this));
        if (pay > bal) pay = bal;
        if (pay == 0) revert Closed();
        paid[bout] = true;
        SafeERC20.safeTransfer(fish, msg.sender, pay);
        emit Awarded(bout, id, target, msg.sender, pay);
    }

    /// @notice Shoal kill payout on Arc.
    function version() external pure returns (string memory) {
        return "fishearn-arc-1";
    }
}
