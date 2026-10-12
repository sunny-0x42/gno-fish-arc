// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title FishProfile
/// @author Shoal
/// @notice Shoal sailor cards on Arc testnet. One address, one sailor card.
///         This contract holds no USDC and mints no fish.
/// @dev Username is trimmed and folded to lowercase. Country and crest stay case-sensitive.
contract FishProfile {
    struct Card {
        string username;
        string country;
        string crest;
    }

    mapping(address => Card) private _cards;
    mapping(bytes32 => address) private _byName;
    mapping(bytes32 => bool) private _extraCountry;
    mapping(bytes32 => bool) private _extraCrest;

    address public admin;
    bool public adminSet;

    event SetProfile(address indexed who, string username, string country, string crest);
    event ClaimAdmin(address indexed who);
    event AddCountry(string name);
    event AddCrest(string name);

    error Payment();
    error Name();
    error Country();
    error Crest();
    error Taken();
    error Admin();

    modifier noPay() {
        if (msg.value != 0) revert Payment();
        _;
    }

    /// @notice Shoal profile package on Arc.
    function version() external pure returns (string memory) {
        return "profile-arc-2";
    }

    /// @notice Store this caller's sailor card. A fish NFT is not required.
    /// @dev The same card again is a no-op and does not emit.
    function setProfile(string calldata username, string calldata country, string calldata crest) external payable noPay {
        string memory name = _cleanUser(username);
        if (bytes(name).length == 0) revert Name();
        if (!_knownCountry(country)) revert Country();
        if (!_knownCrest(crest)) revert Crest();
        address owner = _byName[keccak256(bytes(name))];
        if (owner != address(0) && owner != msg.sender) revert Taken();
        Card storage prev = _cards[msg.sender];
        if (
            bytes(prev.username).length != 0 && keccak256(bytes(prev.username)) == keccak256(bytes(name))
                && keccak256(bytes(prev.country)) == keccak256(bytes(country))
                && keccak256(bytes(prev.crest)) == keccak256(bytes(crest))
        ) {
            return;
        }
        if (bytes(prev.username).length != 0 && keccak256(bytes(prev.username)) != keccak256(bytes(name))) {
            delete _byName[keccak256(bytes(prev.username))];
        }
        _cards[msg.sender] = Card({username: name, country: country, crest: crest});
        _byName[keccak256(bytes(name))] = msg.sender;
        emit SetProfile(msg.sender, name, country, crest);
    }

    /// @notice The first caller becomes admin. A later caller cannot replace them.
    function claimAdmin() external payable noPay {
        if (adminSet) revert Admin();
        admin = msg.sender;
        adminSet = true;
        emit ClaimAdmin(msg.sender);
    }

    /// @notice Admin adds one country name. Built-in names stay.
    function addCountry(string calldata name) external payable noPay {
        if (!adminSet || msg.sender != admin) revert Admin();
        if (!_placeName(name) || _knownCountry(name)) revert Country();
        _extraCountry[keccak256(bytes(name))] = true;
        emit AddCountry(name);
    }

    /// @notice Admin adds one crest name. Built-in names stay.
    function addCrest(string calldata name) external payable noPay {
        if (!adminSet || msg.sender != admin) revert Admin();
        if (!_placeName(name) || _knownCrest(name)) revert Crest();
        _extraCrest[keccak256(bytes(name))] = true;
        emit AddCrest(name);
    }

    function has(address who) external view returns (bool) {
        return bytes(_cards[who].username).length != 0;
    }

    function usernameOf(address who) external view returns (string memory) {
        return _cards[who].username;
    }

    function countryOf(address who) external view returns (string memory) {
        return _cards[who].country;
    }

    function crestOf(address who) external view returns (string memory) {
        return _cards[who].crest;
    }

    function addressOf(string calldata username) external view returns (address) {
        string memory name = _cleanUser(username);
        if (bytes(name).length == 0) return address(0);
        return _byName[keccak256(bytes(name))];
    }

    function _cleanUser(string memory name) private pure returns (string memory) {
        bytes memory raw = bytes(name);
        uint256 left;
        uint256 right = raw.length;
        while (left < right && raw[left] == 0x20) left++;
        while (right > left && raw[right - 1] == 0x20) right--;
        uint256 n = right - left;
        if (n < 3 || n > 16) return "";
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; i++) {
            bytes1 c = raw[left + i];
            if (c >= 0x41 && c <= 0x5A) c = bytes1(uint8(c) + 32);
            bool ok = (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39);
            if (!ok) return "";
            out[i] = c;
        }
        return string(out);
    }

    function _knownCountry(string memory name) private view returns (bool) {
        bytes32 key = keccak256(bytes(name));
        return key == keccak256("Sea") || key == keccak256("Vietnam") || key == keccak256("Korea")
            || key == keccak256("Japan") || key == keccak256("Brazil") || key == keccak256("France")
            || key == keccak256("Nigeria") || key == keccak256("Canada") || key == keccak256("Australia")
            || _extraCountry[key];
    }

    function _knownCrest(string memory name) private view returns (bool) {
        bytes32 key = keccak256(bytes(name));
        return key == keccak256("wave") || key == keccak256("reef") || key == keccak256("moon")
            || key == keccak256("sun") || key == keccak256("fang") || key == keccak256("shell") || _extraCrest[key];
    }

    function _placeName(string memory name) private pure returns (bool) {
        bytes memory raw = bytes(name);
        if (raw.length < 2 || raw.length > 24) return false;
        for (uint256 i; i < raw.length; i++) {
            bytes1 c = raw[i];
            bool ok = (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A);
            if (!ok) return false;
        }
        return true;
    }

    /// @dev Attached value is rejected. The profile book holds no coins.
    receive() external payable {
        revert Payment();
    }
}
