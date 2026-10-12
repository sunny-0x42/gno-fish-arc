// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {FishNFT} from "../src/FishNFT.sol";

contract FishNFTTest is Test {
    uint256 internal constant UNIT = 1e18;

    FishNFT internal nft;
    address internal upgrade = makeAddr("upgrade");
    address internal lp = makeAddr("lp");
    address internal ash = makeAddr("ash");
    address internal team = makeAddr("team");
    address internal protocol = makeAddr("protocol");
    address internal season = makeAddr("season");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    receive() external payable {}

    function setUp() public {
        nft = new FishNFT("Shoal Fish", "FISH", "https://shoal.example/art", 500, upgrade, lp, ash, team, protocol, season);
    }

    function test_mintSplitHpAndSecondMint() public {
        _mint(alice, "Blue Fin", 5 * UNIT);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.nameOf(1), "Blue Fin");
        assertEq(nft.speciesOf(1), "Bubble");
        assertEq(nft.rarityOf(1), "common");
        assertEq(nft.sizeOf(1), "medium");
        assertEq(nft.traitOf(1), "hide");
        assertEq(nft.hpOf(1), 112);
        assertEq(nft.dodgeOf(1), 12);
        assertEq(nft.imageOf(1), "https://shoal.example/art/common.glb");
        assertEq(upgrade.balance, 3 * UNIT);
        assertEq(lp.balance, UNIT);
        assertEq(team.balance, UNIT / 2);
        assertEq(ash.balance, UNIT / 2);
        assertEq(address(nft).balance, 0);
        assertEq(nft.unplayedOf(alice), 1);

        vm.deal(alice, 5 * UNIT);
        vm.prank(alice);
        vm.expectRevert(FishNFT.Unplayed.selector);
        nft.mint{value: 5 * UNIT}("Other");

        vm.deal(bob, 5 * UNIT);
        vm.prank(bob);
        vm.expectRevert(FishNFT.Name.selector);
        nft.mint{value: 5 * UNIT}("nope!");
    }

    function test_mintDustJoinsBurn() public {
        uint256 fee = UNIT + 1;
        nft.setMintFee(fee);
        uint256 up = fee * 6000 / 10_000;
        uint256 lpPart = fee * 2000 / 10_000;
        uint256 teamPart = fee * 1000 / 10_000;
        uint256 burnPart = fee - up - lpPart - teamPart;
        _mint(alice, "a", fee);
        assertEq(nft.hpOf(1), 112);
        assertEq(nft.sizeOf(1), "medium");
        assertEq(nft.traitOf(1), "hide");
        assertEq(ash.balance, burnPart);
        assertEq(burnPart, teamPart + 1);
        assertEq(address(nft).balance, 0);
    }

    function test_listBuyCancelAndRegister() public {
        _mint(alice, "Pebble", 5 * UNIT);
        vm.prank(alice);
        nft.list(1, 100 * UNIT);
        assertEq(nft.ownerOf(1), address(nft));
        assertEq(nft.sellerOf(1), alice);
        assertEq(nft.unplayedOf(alice), 1);

        vm.prank(alice);
        nft.updatePrice(1, 100 * UNIT);
        vm.deal(alice, 100 * UNIT);
        vm.prank(alice);
        vm.expectRevert(FishNFT.Self.selector);
        nft.buy{value: 100 * UNIT}(1);

        vm.deal(alice, 0);
        vm.deal(bob, 100 * UNIT);
        uint256 royalBefore = address(this).balance;
        vm.prank(bob);
        nft.buy{value: 100 * UNIT}(1);
        assertEq(nft.ownerOf(1), bob);
        assertEq(alice.balance, 93 * UNIT);
        assertEq(address(this).balance - royalBefore, 5 * UNIT);
        assertEq(protocol.balance, 2 * UNIT);
        assertEq(nft.unplayedOf(alice), 0);
        assertEq(nft.unplayedOf(bob), 1);
        assertEq(address(nft).balance, 0);

        vm.deal(alice, 5 * UNIT);
        vm.prank(alice);
        nft.mint{value: 5 * UNIT}("Silt");
        vm.prank(alice);
        nft.list(2, 10 * UNIT);
        vm.prank(alice);
        nft.cancel(2);
        assertEq(nft.ownerOf(2), alice);
        assertFalse(nft.listed(2));

        vm.deal(bob, 10 * UNIT);
        vm.prank(bob);
        nft.register{value: 10 * UNIT}(1);
        assertEq(nft.poolOf(1), 10 * UNIT);
        assertEq(address(nft).balance, 10 * UNIT);
        vm.prank(bob);
        vm.expectRevert(FishNFT.Locked.selector);
        nft.transferFrom(bob, alice, 1);
        vm.prank(bob);
        nft.leave(1);
        assertEq(nft.poolOf(1), 0);
        assertEq(bob.balance, 10 * UNIT);
        assertEq(address(nft).balance, 0);
    }

    function test_oneSeaSeatAfterTransfer() public {
        _mint(alice, "Pebble", 5 * UNIT);
        _mint(bob, "Silt", 5 * UNIT);
        vm.prank(bob);
        nft.transferFrom(bob, alice, 2);
        assertEq(nft.unplayedOf(alice), 2);
        assertEq(nft.unplayedOf(bob), 0);

        vm.deal(alice, 20 * UNIT);
        vm.prank(alice);
        nft.register{value: 10 * UNIT}(1);
        vm.prank(alice);
        vm.expectRevert(FishNFT.One.selector);
        nft.register{value: 10 * UNIT}(2);
        vm.prank(alice);
        vm.expectRevert(FishNFT.Stake.selector);
        nft.register{value: UNIT}(2);
    }

    function test_setArtAndFeeGuards() public {
        _mint(alice, "Pebble", 5 * UNIT);
        assertEq(nft.hpOf(1), 112);
        vm.prank(alice);
        vm.expectRevert(FishNFT.Owner.selector);
        nft.setArt("https://shoal.example/other.png");
        nft.setArt("https://gateway.pinata.cloud/ipfs/bafybeid6uahelm3h2oo7rs4z6cgdyrpkueuvcychwuz5fw5tf7mj6hggli");
        assertEq(nft.portrait(), "https://gateway.pinata.cloud/ipfs/bafybeid6uahelm3h2oo7rs4z6cgdyrpkueuvcychwuz5fw5tf7mj6hggli");
        assertEq(nft.imageOf(1), "https://shoal.example/art/common.glb");
        assertTrue(_has(nft.tokenURI(1), "Bubble"));
        assertTrue(_has(nft.tokenURI(1), '"animation_url":"https://shoal.example/art/common.glb"'));

        vm.prank(alice);
        vm.expectRevert(FishNFT.Owner.selector);
        nft.setMintFee(UNIT);
        vm.expectRevert(FishNFT.Fee.selector);
        nft.setMintFee(UNIT - 1);
        nft.setFishReserve(season);
        assertEq(nft.fishReserve(), season);
        assertEq(nft.version(), "fish-arc-5");
        assertEq(nft.mintPrice(), 5 * UNIT);
        assertEq(nft.stakeMin(), 10 * UNIT);
    }

    function test_coinFlipLadder() public {
        string[6] memory species = ["Bubble", "Tideblade", "Abysswing", "Embermaw", "Aurelion", "Astravex"];
        string[6] memory rarity = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
        for (uint256 tier; tier < 6; ++tier) {
            address who = address(uint160(0xA11CE + tier));
            uint256 id = nft.minted() + 1;
            vm.prevrandao(_saltTier(who, id, tier));
            vm.deal(who, 5 * UNIT);
            vm.prank(who);
            nft.mint{value: 5 * UNIT}("Fin");
            assertEq(nft.speciesOf(id), species[tier]);
            assertEq(nft.rarityOf(id), rarity[tier]);
            assertEq(nft.sizeOf(id), "medium");
            assertEq(nft.imageOf(id), string.concat("https://shoal.example/art/", rarity[tier], ".glb"));
        }
    }

    function test_traitCoinFlip() public {
        string[3] memory names = ["swift", "fang", "hide"];
        uint16[3] memory hp = [uint16(100), 100, 112];
        uint16[3] memory dodge = [uint16(24), 4, 12];
        for (uint256 trait; trait < 3; ++trait) {
            address who = address(uint160(0xBEEF + trait));
            uint256 id = nft.minted() + 1;
            vm.prevrandao(_salt(who, id, 0, trait));
            vm.deal(who, 5 * UNIT);
            vm.prank(who);
            nft.mint{value: 5 * UNIT}("Fin");
            assertEq(nft.speciesOf(id), "Bubble");
            assertEq(nft.sizeOf(id), "medium");
            assertEq(nft.traitOf(id), names[trait]);
            assertEq(nft.hpOf(id), hp[trait]);
            assertEq(nft.dodgeOf(id), dodge[trait]);
        }
    }

    function test_twoHeadsClimbIsRarer() public view {
        uint256[6] memory tiers;
        uint256[3] memory traits;
        address who = address(0xB0B);
        for (uint256 i; i < 8192; ++i) {
            (uint256 tier, uint256 trait) = _rollOf(bytes32(i), who, 1);
            tiers[tier] += 1;
            traits[trait] += 1;
        }
        assertGt(tiers[0], tiers[1]);
        assertGt(tiers[1], tiers[2]);
        assertGt(tiers[2], tiers[3]);
        assertGt(tiers[0], 5500);
        assertLt(tiers[0], 6800);
        assertLt(tiers[5], 40);
        assertGt(traits[0], traits[1]);
        assertGt(traits[1], 1500);
        assertLt(traits[1], 2600);
        assertGt(traits[2], 1500);
        assertLt(traits[2], 2600);
    }

    /// @dev Trait 2 is hide, so HP stays 112 in the fee tests.
    function _mint(address who, string memory name, uint256 fee) private {
        vm.prevrandao(_salt(who, nft.minted() + 1, 0, 2));
        vm.deal(who, fee);
        vm.prank(who);
        nft.mint{value: fee}(name);
    }

    function _rollOf(bytes32 randao, address who, uint256 id) private view returns (uint256 tier, uint256 trait) {
        uint256 seed = uint256(keccak256(abi.encode(randao, who, id, address(nft))));
        for (uint256 step; step < 5 && tier < 5; ++step) {
            if (((seed >> (step * 2)) & 3) != 3) break;
            tier += 1;
        }
        if (((seed >> 10) & 1) == 0) trait = 0;
        else if (((seed >> 11) & 1) == 0) trait = 1;
        else trait = 2;
    }

    function _saltTier(address who, uint256 id, uint256 want) private view returns (bytes32) {
        for (uint256 i; i < 100_000; ++i) {
            (uint256 tier,) = _rollOf(bytes32(i), who, id);
            if (tier == want) return bytes32(i);
        }
        revert("salt");
    }

    function _salt(address who, uint256 id, uint256 wantTier, uint256 wantTrait) private view returns (bytes32) {
        for (uint256 i; i < 100_000; ++i) {
            (uint256 tier, uint256 trait) = _rollOf(bytes32(i), who, id);
            if (tier == wantTier && trait == wantTrait) return bytes32(i);
        }
        revert("salt");
    }

    function _has(string memory text, string memory part) private pure returns (bool) {
        return bytes(text).length >= bytes(part).length && _index(text, part);
    }

    function _index(string memory text, string memory part) private pure returns (bool) {
        bytes memory hay = bytes(text);
        bytes memory needle = bytes(part);
        if (needle.length == 0 || needle.length > hay.length) return false;
        for (uint256 i; i <= hay.length - needle.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < needle.length; ++j) {
                if (hay[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}
