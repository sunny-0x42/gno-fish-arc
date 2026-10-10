// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {FishDuel} from "../src/FishDuel.sol";

contract FishDuelTest is Test {
    uint256 internal constant UNIT = 1e18;
    uint256 internal constant ALICE = 0xA11CE;
    uint256 internal constant BOB = 0xB0B;
    uint256 internal constant CAROL = 0xCA401;
    uint256 internal constant DAVE = 0xDA7E;
    uint256 internal constant MARK_A = 0x1111;
    uint256 internal constant MARK_B = 0x2222;
    uint256 internal constant MARK_C = 0x3333;
    uint256 internal constant MARK_D = 0x4444;

    FishDuel internal duel;
    address internal lp;
    address internal crew;
    address internal ash;
    address internal alice;
    address internal bob;

    function setUp() public {
        lp = makeAddr("lp");
        crew = makeAddr("crew");
        ash = makeAddr("ash");
        alice = vm.addr(ALICE);
        bob = vm.addr(BOB);
        vm.warp(1_700_000_010);
        vm.roll(1);
        duel = new FishDuel(lp, crew, ash);
    }

    function testStrike() public view {
        assertEq(duel.strike(69, 88), 36);
        assertEq(duel.strike(0, 10), 1);
        assertEq(duel.strike(25, 0), 25);
    }

    function testRejectsBadInitAndPayment() public {
        vm.expectRevert(FishDuel.Addr.selector);
        new FishDuel(lp, lp, ash);

        vm.deal(alice, UNIT - 1);
        vm.prank(alice);
        vm.expectRevert(FishDuel.Payment.selector);
        duel.mint{value: UNIT - 1}("pebble");

        vm.deal(alice, UNIT);
        vm.prank(alice);
        vm.expectRevert(FishDuel.MintClosed.selector);
        duel.mint{value: UNIT}("Pebble");
    }

    function testDuelPaysCoveredStake() public {
        uint256 id = _mint(alice, "pebble");
        uint256 other = _mint(bob, "silt");
        assertEq(lp.balance, (UNIT * 60) / 100 * 2);
        assertEq(crew.balance, (UNIT * 30) / 100 * 2);
        assertEq(ash.balance, (UNIT * 10) / 100 * 2);
        assertEq(address(duel).balance, 0);

        _seat(alice, id, UNIT, vm.addr(MARK_A));
        _seat(bob, other, UNIT, vm.addr(MARK_B));
        assertEq(duel.openBout(), 1);
        assertTrue(duel.boutOpen());
        assertEq(duel.seatHeight(), 1);

        vm.prank(alice);
        vm.expectRevert(FishDuel.LeaveClosed.selector);
        duel.leave(id);

        vm.roll(12);
        string memory farPack = _pack(id, other, MARK_A, MARK_B, true, false);
        string memory badPack = _pack(id, other, MARK_A, MARK_B, false, true);
        string memory goodPack = _pack(id, other, MARK_A, MARK_B, false, false);
        vm.prank(alice);
        vm.expectRevert(FishDuel.OutOfRange.selector);
        duel.settle(id, other, farPack);
        vm.prank(alice);
        vm.expectRevert(FishDuel.BadSig.selector);
        duel.settle(id, other, badPack);
        assertEq(duel.poolOf(id), UNIT);
        assertEq(duel.poolOf(other), UNIT);

        uint256 lp0 = lp.balance;
        uint256 crew0 = crew.balance;
        uint256 ash0 = ash.balance;
        uint256 alice0 = alice.balance;
        uint256 bob0 = bob.balance;
        vm.prank(alice);
        duel.settle(id, other, goodPack);

        assertFalse(duel.inSea(other));
        assertTrue(duel.ended(other));
        assertEq(duel.hpOf(other), 0);
        assertEq(duel.poolOf(other), 0);
        assertEq(duel.poolOf(id), UNIT);
        assertTrue(duel.inSea(id));
        assertFalse(duel.boutOpen());
        assertEq(alice.balance - alice0, (UNIT * 80) / 100);
        assertEq(bob.balance - bob0, 0);
        assertEq(lp.balance - lp0, UNIT / 10);
        assertEq(crew.balance - crew0, (UNIT * 7) / 100);
        assertEq(ash.balance - ash0, (UNIT * 3) / 100);

        vm.prank(alice);
        duel.leave(id);
        assertFalse(duel.inSea(id));
        assertEq(duel.poolOf(id), 0);
        assertEq(address(duel).balance, 0);
        assertEq(alice.balance - alice0, (UNIT * 80) / 100 + UNIT);
    }

    function testQuietLeaveThenUnequalStake() public {
        uint256 id = _mint(alice, "pebble");
        uint256 other = _mint(bob, "silt");
        _seat(alice, id, UNIT, vm.addr(MARK_A));
        _seat(bob, other, UNIT, vm.addr(MARK_B));
        vm.roll(12);
        string memory firstPack = _pack(id, other, MARK_A, MARK_B, false, false);
        vm.prank(alice);
        duel.settle(id, other, firstPack);
        vm.prank(alice);
        duel.leave(id);
        vm.prank(bob);
        vm.expectRevert(FishDuel.LeaveClosed.selector);
        duel.leave(other);

        address carol = vm.addr(CAROL);
        address dave = vm.addr(DAVE);
        uint256 c = _mint(carol, "kelp");
        uint256 d = _mint(dave, "reef");
        _seat(carol, c, UNIT, vm.addr(MARK_C));
        _seat(dave, d, UNIT, vm.addr(MARK_D));
        assertEq(duel.openBout(), 2);
        vm.prank(carol);
        vm.expectRevert(FishDuel.LeaveClosed.selector);
        duel.leave(c);
        vm.warp(block.timestamp + 61);
        vm.prank(carol);
        duel.leave(c);
        assertFalse(duel.inSea(c));
        assertEq(duel.poolOf(c), 0);
        assertFalse(duel.boutOpen());
        assertTrue(duel.inSea(d));

        vm.prank(dave);
        duel.leave(d);

        uint256 e = _mint(carol, "brine");
        uint256 f = _mint(dave, "marrow");
        _seat(carol, e, UNIT, vm.addr(MARK_C));
        _seat(dave, f, 2 * UNIT, vm.addr(MARK_D));
        uint256 daveBefore = dave.balance;
        vm.roll(block.number + 12);
        string memory unevenPack = _pack(e, f, MARK_C, MARK_D, false, false);
        vm.prank(carol);
        duel.settle(e, f, unevenPack);
        assertEq(dave.balance - daveBefore, UNIT);
        assertEq(duel.poolOf(e), UNIT);
        vm.prank(carol);
        duel.leave(e);
        assertEq(address(duel).balance, 0);
    }

    function _mint(address who, string memory name) internal returns (uint256 id) {
        vm.deal(who, who.balance + UNIT);
        vm.prank(who);
        id = duel.mint{value: UNIT}(name);
    }

    function _seat(address who, uint256 id, uint256 stake, address mark) internal {
        vm.deal(who, who.balance + stake);
        vm.prank(who);
        duel.register{value: stake}(id, stake, mark);
    }

    function _pack(uint256 id, uint256 other, uint256 markA, uint256 markB, bool far, bool bad) internal view returns (string memory) {
        uint256 bout = duel.openBout();
        uint256[3] memory heights = [uint256(block.number - 2), block.number - 1, block.number];
        uint256[3] memory times = [uint256(1_700_000_000_000), 1_700_000_003_000, 1_700_000_006_000];
        int256[3] memory ax = [int256(0), 1, 2];
        int256[3] memory az = [int256(0), 0, 0];
        int256[3] memory bx = [int256(1), 1, 2];
        int256[3] memory bz = [int256(0), 1, far ? int256(8) : int256(1)];
        string memory pack;
        for (uint256 i; i < 3; i++) {
            string memory secretA = _secret("aa", i + 1);
            string memory secretB = _secret("bb", i + 1);
            bytes memory sigA = _sign(markA, bout, i + 1, heights[i], id, ax[i], az[i], times[i], secretA);
            bytes memory sigB = _sign(markB, bout, i + 1, heights[i], other, bx[i], bz[i], times[i], secretB);
            if (bad && i == 2) sigB[64] ^= 0x01;
            string memory rowA = _row(bout, i + 1, heights[i], id, ax[i], az[i], times[i], secretA, sigA);
            string memory rowB = _row(bout, i + 1, heights[i], other, bx[i], bz[i], times[i], secretB, sigB);
            pack = i == 0 ? string.concat(rowA, "/", rowB) : string.concat(pack, "/", rowA, "/", rowB);
        }
        return pack;
    }

    function _row(uint256 bout, uint256 seq, uint256 height, uint256 id, int256 x, int256 z, uint256 at, string memory secret, bytes memory sig)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            vm.toString(bout),
            ":",
            vm.toString(seq),
            ":",
            vm.toString(height),
            ":",
            vm.toString(id),
            ":",
            vm.toString(x),
            ":",
            vm.toString(z),
            ":",
            vm.toString(at),
            ":",
            secret,
            ":",
            _hex(sig)
        );
    }

    function _sign(uint256 pk, uint256 bout, uint256 seq, uint256 height, uint256 id, int256 x, int256 z, uint256 at, string memory secret)
        internal
        view
        returns (bytes memory)
    {
        bytes32 hash = keccak256(bytes(duel.canon(bout, seq, height, id, x, z, at, secret)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, MessageHashUtils.toEthSignedMessageHash(hash));
        return abi.encodePacked(r, s, v);
    }

    function _secret(string memory tag, uint256 n) internal pure returns (string memory) {
        return string.concat(tag, "0100112233445566778899aabbcc0", vm.toString(n));
    }

    function _hex(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(data.length * 2);
        for (uint256 i; i < data.length; i++) {
            out[i * 2] = alphabet[uint8(data[i] >> 4)];
            out[i * 2 + 1] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(out);
    }
}
