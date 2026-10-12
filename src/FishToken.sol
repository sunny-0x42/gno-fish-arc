// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FishToken
/// @author Shoal
/// @notice Fixed FISH ledger on Arc testnet. 100,000,000 tokens, 6 decimals.
/// @dev Season tokens sit on this contract until `releaseSeason` sends them once.
///      Ecosystem, community, public sale, and team share one wallet until those
///      treasuries exist. There is no further mint.
contract FishToken is ERC20 {
    uint256 public constant UNIT = 1e6;
    uint256 public constant SUPPLY = 100_000_000 * UNIT;
    uint256 public constant SEASON = 43_000_000 * UNIT;
    uint256 public constant LIQUIDITY = 20_000_000 * UNIT;
    uint256 public constant ECOSYSTEM = 15_000_000 * UNIT;
    uint256 public constant COMMUNITY = 12_000_000 * UNIT;
    uint256 public constant SALE = 5_000_000 * UNIT;
    uint256 public constant TEAM = 5_000_000 * UNIT;

    address public immutable deployer;
    address public immutable liquidity;
    address public immutable team;
    bool public released;

    event SeasonReleased(address indexed earn, uint256 amount);

    error Addr();
    error Closed();

    /// @param lp Liquidity allocation. Must differ from `crew`.
    /// @param crew Wallet for ecosystem, community, public sale, and team.
    constructor(address lp, address crew) ERC20("FISH", "FISH") {
        if (lp == address(0) || crew == address(0) || lp == crew) revert Addr();
        deployer = msg.sender;
        liquidity = lp;
        team = crew;
        _mint(address(this), SEASON);
        _mint(lp, LIQUIDITY);
        _mint(crew, ECOSYSTEM);
        _mint(crew, COMMUNITY);
        _mint(crew, SALE);
        _mint(crew, TEAM);
    }

    /// @notice Six decimals. 1,000,000 units is one FISH.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Move the season allocation once, to the earn contract.
    /// @param earn Recipient. It should be FishEarn.
    function releaseSeason(address earn) external {
        if (msg.sender != deployer || released || earn == address(0)) revert Closed();
        uint256 amount = balanceOf(address(this));
        if (amount != SEASON) revert Closed();
        released = true;
        _transfer(address(this), earn, amount);
        emit SeasonReleased(earn, amount);
    }

    /// @notice Shoal FISH ledger on Arc.
    function version() external pure returns (string memory) {
        return "fishtoken-arc-1";
    }
}
