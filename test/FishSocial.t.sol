// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {FishParty} from "../src/FishParty.sol";
import {FishProfile} from "../src/FishProfile.sol";

contract FishSocialTest is Test {
    FishProfile internal profile;
    FishParty internal party;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        profile = new FishProfile();
        party = new FishParty();
    }

    function test_profileCardAndPayment() public {
        vm.prank(alice);
        profile.setProfile("  Skipper ", "Vietnam", "wave");
        assertEq(profile.usernameOf(alice), "skipper");
        assertEq(profile.countryOf(alice), "Vietnam");
        assertEq(profile.crestOf(alice), "wave");
        assertEq(profile.addressOf("SKIPPER"), alice);
        assertTrue(profile.has(alice));

        vm.prank(alice);
        profile.setProfile("skipper", "Vietnam", "wave");
        assertEq(profile.usernameOf(alice), "skipper");

        vm.prank(bob);
        vm.expectRevert(FishProfile.Taken.selector);
        profile.setProfile("Skipper", "Korea", "sun");

        vm.prank(alice);
        profile.setProfile("pebble", "Sea", "shell");
        assertEq(profile.addressOf("skipper"), address(0));
        assertEq(profile.addressOf("pebble"), alice);

        vm.prank(bob);
        vm.expectRevert(FishProfile.Country.selector);
        profile.setProfile("brine", "Germany", "wave");

        vm.deal(alice, 1);
        vm.prank(alice);
        vm.expectRevert(FishProfile.Payment.selector);
        profile.setProfile{value: 1}("pebble", "Sea", "shell");

        vm.deal(address(this), 1);
        (bool ok, bytes memory reason) = address(profile).call{value: 1}("");
        assertFalse(ok);
        assertEq(bytes4(reason), FishProfile.Payment.selector);
    }

    function test_profileAdminExtendsLists() public {
        vm.prank(bob);
        vm.expectRevert(FishProfile.Admin.selector);
        profile.addCountry("Chile");

        vm.prank(alice);
        profile.claimAdmin();
        vm.prank(bob);
        vm.expectRevert(FishProfile.Admin.selector);
        profile.claimAdmin();

        vm.prank(alice);
        profile.addCountry("Chile");
        vm.prank(bob);
        profile.setProfile("brine", "Chile", "fang");
        assertEq(profile.countryOf(bob), "Chile");

        vm.prank(alice);
        vm.expectRevert(FishProfile.Country.selector);
        profile.addCountry("Vietnam");
        vm.prank(alice);
        vm.expectRevert(FishProfile.Crest.selector);
        profile.addCrest("wave");
        vm.prank(alice);
        profile.addCrest("Kraken");
        vm.prank(bob);
        profile.setProfile("brine", "Chile", "Kraken");
        assertEq(profile.crestOf(bob), "Kraken");
    }

    function test_partyRoster() public {
        vm.prank(alice);
        uint256 id = party.create("Tide Pool");
        assertEq(id, 1);
        assertEq(party.leaderOf(1), alice);
        assertEq(party.memberAt(1, 0), alice);

        vm.prank(bob);
        vm.expectRevert(FishParty.Name.selector);
        party.create("Tide Pool");
        vm.prank(bob);
        vm.expectRevert(FishParty.Name.selector);
        party.create("Tide!");

        vm.prank(alice);
        vm.expectRevert(FishParty.Self.selector);
        party.invite(alice);
        vm.prank(alice);
        party.invite(bob);
        vm.prank(bob);
        assertEq(party.accept(), 1);
        assertTrue(party.sameParty(alice, bob));
        assertEq(party.memberCount(1), 2);

        vm.prank(bob);
        party.leave();
        assertEq(party.partyOf(bob), 0);
        assertEq(party.leaderOf(1), alice);
        assertEq(party.memberCount(1), 1);

        vm.prank(alice);
        party.invite(bob);
        vm.prank(bob);
        party.accept();
        vm.prank(alice);
        party.kick(bob);
        assertEq(party.partyOf(bob), 0);

        vm.prank(alice);
        party.invite(carol);
        vm.prank(carol);
        party.accept();
        vm.prank(carol);
        vm.expectRevert(FishParty.Leader.selector);
        party.disband();
        vm.prank(alice);
        party.disband();
        vm.expectRevert(FishParty.None.selector);
        party.nameOf(1);

        vm.prank(bob);
        uint256 again = party.create("Tide Pool");
        assertEq(again, 2);
    }

    function test_partyCapAndPayment() public {
        vm.prank(alice);
        party.claimAdmin();
        vm.prank(alice);
        vm.expectRevert(FishParty.Cap.selector);
        party.setCap(1);
        vm.prank(alice);
        party.setCap(2);

        vm.prank(bob);
        party.create("Reef");
        vm.prank(bob);
        party.invite(alice);
        vm.prank(bob);
        party.invite(carol);
        vm.prank(alice);
        party.accept();
        vm.prank(carol);
        vm.expectRevert(FishParty.Full.selector);
        party.accept();
        vm.prank(bob);
        vm.expectRevert(FishParty.Full.selector);
        party.invite(makeAddr("dave"));

        vm.deal(bob, 1);
        vm.prank(bob);
        vm.expectRevert(FishParty.Payment.selector);
        party.leave{value: 1}();
    }

    function test_versions() public view {
        assertEq(profile.version(), "profile-arc-2");
        assertEq(party.version(), "party-arc-2");
        assertEq(party.cap(), 8);
    }
}
