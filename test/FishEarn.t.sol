// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {FishDuel} from "../src/FishDuel.sol";
import {FishEarn} from "../src/FishEarn.sol";
import {FishToken} from "../src/FishToken.sol";

contract FishEarnTest is Test {
    uint256 internal constant USDC = 1e18;
    uint256 internal constant FISH = 1e6;

    FishDuel internal duel;
    FishToken internal token;
    FishEarn internal earn;
    address internal lp;
    address internal crew;
    address internal ash;
    address internal alice;
    address internal bob;

    function setUp() public {
        lp = makeAddr("lp");
        crew = makeAddr("crew");
        ash = makeAddr("ash");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        vm.warp(1_700_000_010);
        vm.roll(1);
        duel = new FishDuel(lp, crew, ash);
        token = new FishToken(lp, crew);
        earn = new FishEarn(token, address(duel));
        token.releaseSeason(address(earn));
    }

    function testSupplyAndOneRelease() public {
        assertEq(token.decimals(), 6);
        assertEq(token.totalSupply(), 100_000_000 * FISH);
        assertEq(token.balanceOf(lp), 20_000_000 * FISH);
        assertEq(token.balanceOf(crew), 37_000_000 * FISH);
        assertEq(token.balanceOf(address(earn)), 43_000_000 * FISH);
        assertEq(token.balanceOf(address(token)), 0);
        assertTrue(token.released());
        assertEq(token.version(), "fishtoken-arc-1");
        assertEq(earn.version(), "fishearn-arc-1");

        vm.expectRevert(FishToken.Closed.selector);
        token.releaseSeason(address(earn));
    }

    function testAwardPaysOneFishPerUsdcOnce() public {
        uint256 id = _seatPair(USDC, 2 * USDC);
        vm.warp(block.timestamp + 3);

        vm.prank(alice);
        vm.expectRevert(FishEarn.Closed.selector);
        earn.award(id, id);

        vm.prank(bob);
        vm.expectRevert(FishEarn.Closed.selector);
        earn.award(id, _other(id));

        vm.prank(alice);
        earn.award(id, _other(id));
        assertEq(token.balanceOf(alice), FISH);
        assertEq(token.balanceOf(address(earn)), 43_000_000 * FISH - FISH);
        assertTrue(earn.paid(duel.openBout()));
        assertEq(duel.poolOf(id), USDC);
        assertEq(duel.poolOf(_other(id)), 2 * USDC);
        assertTrue(duel.boutOpen());

        vm.prank(alice);
        vm.expectRevert(FishEarn.Closed.selector);
        earn.award(id, _other(id));
    }

    function testAwardWaitsForTheSeatGap() public {
        uint256 id = _seatPair(USDC, USDC);
        vm.prank(alice);
        vm.expectRevert(FishEarn.Closed.selector);
        earn.award(id, _other(id));
        assertEq(token.balanceOf(alice), 0);
        assertFalse(earn.paid(1));
    }

    function testAwardNeedsAnOpenBout() public {
        vm.deal(alice, USDC * 2);
        vm.prank(alice);
        uint256 id = duel.mint{value: USDC}("pebble");
        vm.prank(alice);
        duel.register{value: USDC}(id, USDC, alice);
        vm.warp(block.timestamp + 3);
        vm.prank(alice);
        vm.expectRevert(FishEarn.Closed.selector);
        earn.award(id, id + 1);
    }

    function _seatPair(uint256 aliceStake, uint256 bobStake) internal returns (uint256 id) {
        vm.deal(alice, USDC + aliceStake);
        vm.deal(bob, USDC + bobStake);
        vm.prank(alice);
        id = duel.mint{value: USDC}("pebble");
        vm.prank(bob);
        uint256 other = duel.mint{value: USDC}("silt");
        vm.prank(alice);
        duel.register{value: aliceStake}(id, aliceStake, alice);
        vm.prank(bob);
        duel.register{value: bobStake}(other, bobStake, bob);
    }

    function _other(uint256 id) internal pure returns (uint256) {
        return id == 1 ? 2 : 1;
    }
}
