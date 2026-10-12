// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title FishParty
/// @author Shoal
/// @notice Shoal crews on Arc testnet. A crew shares a fight and holds no coins.
///         This contract does not mint a FISH ledger token.
/// @dev Names are case-sensitive. A closed crew frees its name. Invite rows pointing at a closed
///      crew cannot be enumerated on the EVM; Accept reverts until a live crew invites that address again.
contract FishParty {
    struct Crew {
        string name;
        address leader;
        address[] members;
        bool closed;
    }

    uint256 public constant CAP_FLOOR = 2;
    uint256 public constant CAP_CEIL = 32;

    mapping(uint256 => Crew) private _crews;
    mapping(address => uint256) private _seat;
    mapping(address => uint256) private _invited;
    mapping(bytes32 => uint256) private _nameId;

    uint256 public nextId;
    uint256 public crewCap = 8;
    address public admin;
    bool public adminSet;

    event Created(uint256 indexed id, address indexed leader, string name);
    event Invite(uint256 indexed id, address indexed who);
    event Join(uint256 indexed id, address indexed who);
    event Leave(uint256 indexed id, address indexed who);
    event Kick(uint256 indexed id, address indexed who);
    event Disband(uint256 indexed id);
    event ClaimAdmin(address indexed who);
    event SetCap(uint256 n);

    error Payment();
    error Seat();
    error Name();
    error Addr();
    error Self();
    error Full();
    error None();
    error Leader();
    error Member();
    error Admin();
    error Cap();
    error Index();

    modifier noPay() {
        if (msg.value != 0) revert Payment();
        _;
    }

    function version() external pure returns (string memory) {
        return "party-arc-2";
    }

    function cap() external view returns (uint256) {
        return crewCap;
    }

    /// @notice Open a crew and sit the caller in the first seat.
    function create(string calldata name) external payable noPay returns (uint256 id) {
        if (_seat[msg.sender] != 0) revert Seat();
        if (!_cleanName(name)) revert Name();
        bytes32 key = keccak256(bytes(name));
        if (_nameId[key] != 0) revert Name();
        id = ++nextId;
        Crew storage body = _crews[id];
        body.name = name;
        body.leader = msg.sender;
        body.members.push(msg.sender);
        _seat[msg.sender] = id;
        _nameId[key] = id;
        emit Created(id, msg.sender, name);
    }

    /// @notice The caller invites one address. A later invite replaces the earlier one.
    function invite(address who) external payable noPay {
        if (who == address(0)) revert Addr();
        if (who == msg.sender) revert Self();
        uint256 id = _seat[msg.sender];
        Crew storage body = _open(id);
        if (_seat[who] != 0) revert Seat();
        if (body.members.length >= crewCap) revert Full();
        _invited[who] = id;
        emit Invite(id, who);
    }

    /// @notice Sit in the crew that last invited the caller.
    function accept() external payable noPay returns (uint256 id) {
        if (_seat[msg.sender] != 0) revert Seat();
        id = _invited[msg.sender];
        Crew storage body = _open(id);
        if (body.members.length >= crewCap) revert Full();
        delete _invited[msg.sender];
        body.members.push(msg.sender);
        _seat[msg.sender] = id;
        emit Join(id, msg.sender);
    }

    /// @notice Leave the caller's crew. The first remaining member becomes leader.
    function leave() external payable noPay {
        uint256 id = _seat[msg.sender];
        _open(id);
        _drop(id, msg.sender);
        emit Leave(id, msg.sender);
    }

    /// @notice The leader removes one other member.
    function kick(address who) external payable noPay {
        uint256 id = _seat[msg.sender];
        Crew storage body = _open(id);
        if (body.leader != msg.sender) revert Leader();
        if (who == msg.sender || _seat[who] != id) revert Member();
        _drop(id, who);
        emit Kick(id, who);
    }

    /// @notice The leader closes the crew and frees every seat and the name.
    function disband() external payable noPay {
        uint256 id = _seat[msg.sender];
        Crew storage body = _open(id);
        if (body.leader != msg.sender) revert Leader();
        _close(id);
        emit Disband(id);
    }

    /// @notice The first caller becomes the cap admin.
    function claimAdmin() external payable noPay {
        if (adminSet) revert Admin();
        admin = msg.sender;
        adminSet = true;
        emit ClaimAdmin(msg.sender);
    }

    /// @notice Change how many seats a crew may fill. A crew that is already larger stays as it is.
    function setCap(uint256 n) external payable noPay {
        if (!adminSet || msg.sender != admin) revert Admin();
        if (n < CAP_FLOOR || n > CAP_CEIL) revert Cap();
        crewCap = n;
        emit SetCap(n);
    }

    function partyOf(address who) external view returns (uint256) {
        return _seat[who];
    }

    function sameParty(address a, address b) external view returns (bool) {
        uint256 id = _seat[a];
        return id != 0 && id == _seat[b];
    }

    function nameOf(uint256 id) external view returns (string memory) {
        return _open(id).name;
    }

    function leaderOf(uint256 id) external view returns (address) {
        return _open(id).leader;
    }

    function memberCount(uint256 id) external view returns (uint256) {
        return _open(id).members.length;
    }

    function memberAt(uint256 id, uint256 index) external view returns (address) {
        Crew storage body = _open(id);
        if (index >= body.members.length) revert Index();
        return body.members[index];
    }

    function _open(uint256 id) private view returns (Crew storage body) {
        body = _crews[id];
        if (id == 0 || id > nextId || body.closed) revert None();
    }

    function _drop(uint256 id, address who) private {
        Crew storage body = _crews[id];
        uint256 n = body.members.length;
        address[] memory next = new address[](n);
        uint256 j;
        for (uint256 i; i < n; i++) {
            if (body.members[i] != who) next[j++] = body.members[i];
        }
        delete _seat[who];
        delete _invited[who];
        if (j == 0) {
            _close(id);
            return;
        }
        delete body.members;
        for (uint256 i; i < j; i++) body.members.push(next[i]);
        body.leader = body.members[0];
    }

    function _close(uint256 id) private {
        Crew storage body = _crews[id];
        delete _nameId[keccak256(bytes(body.name))];
        uint256 n = body.members.length;
        for (uint256 i; i < n; i++) delete _seat[body.members[i]];
        delete body.members;
        body.closed = true;
        body.leader = address(0);
        body.name = "";
    }

    function _cleanName(string calldata name) private pure returns (bool) {
        bytes memory raw = bytes(name);
        if (raw.length < 1 || raw.length > 16) return false;
        for (uint256 i; i < raw.length; i++) {
            bytes1 c = raw[i];
            bool ok = (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A) || (c >= 0x30 && c <= 0x39) || c == 0x20;
            if (!ok) return false;
        }
        return true;
    }

    /// @dev Attached value is rejected. A party holds no coins.
    receive() external payable {
        revert Payment();
    }
}
