// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title FishDuel
/// @author Shoal
/// @notice Shoal duel on Arc testnet. Two people mint, stake, and settle one covered kill.
///         Swim stays in the browser. This contract is not the FishNFT collection and it does not mint a FISH ledger token.
/// @dev Native value is Arc USDC, 18 decimals. 1e18 is 1 USDC.
///      Register binds a mark address. The mark may be the fish owner or a session key.
///      Each sample is an EIP-191 signature over `canon`.
contract FishDuel is ReentrancyGuard {
    uint256 public constant UNIT = 1e18;
    uint256 public constant MINT_FEE = 1e18;
    uint256 public constant STAKE_MIN = 1e18;
    uint256 public constant BITE = 69;
    uint256 public constant HP_STAT = 88;
    uint256 public constant REACH = 2;
    uint256 public constant HIT_GAP = 2_400;
    uint256 public constant CELL_MS = 320;
    uint256 public constant QUIET_MS = 60_000;
    uint256 public constant SEAT_MAX = 8;
    int256 public constant BOX = 32;
    uint256 public constant STEP_CAP = 16;
    uint256 public constant PACK_MAX = 2_400;

    struct Swimmer {
        address owner;
        string name;
        uint256 pool;
        uint256 hp;
        bool inSea;
        bool ended;
        bool markSet;
        address mark;
    }

    struct Note {
        uint256 bout;
        uint256 seq;
        uint256 height;
        uint256 id;
        int256 x;
        int256 z;
        uint256 at;
        string secret;
        bytes sig;
    }

    address public immutable lpSink;
    address public immutable team;
    address public immutable burn;

    uint256 public minted;
    uint256 public openBout;
    bool public boutOpen;
    uint256 public seatMilli;
    uint256 public seatHeight;

    mapping(uint256 id => Swimmer fish) private _roster;

    event Minted(uint256 indexed id, address indexed owner, string name);
    event Registered(uint256 indexed id, uint256 indexed bout, address mark);
    event Left(uint256 indexed id, uint256 stake);
    event Killed(uint256 indexed id, uint256 indexed target, uint256 covered);

    error Addr();
    error Payment();
    error MintClosed();
    error StakeLow();
    error RegisterClosed();
    error LeaveClosed();
    error SettleClosed();
    error BadNote();
    error BadSample();
    error OutOfRange();
    error StepTooFar();
    error BadSig();
    error BadHp();
    error NoFish();
    error BadHex();

    /// @param lp Liquidity sink. Distinct from `crew` and `ash`.
    /// @param crew Team sink. Mint's leftover tenth joins this sink, and so does kill cheer.
    /// @param ash Burn sink. Kill buyback is paid here.
    constructor(address lp, address crew, address ash) {
        if (lp == address(0) || crew == address(0) || ash == address(0) || lp == crew || lp == ash || crew == ash) {
            revert Addr();
        }
        lpSink = lp;
        team = crew;
        burn = ash;
    }

    /// @notice Sell one trial fish for exactly 1 USDC. The fee leaves in this call.
    /// @param name 1 to 16 lowercase letters or digits.
    /// @return id The new fish id, starting at 1.
    function mint(string calldata name) external payable nonReentrant returns (uint256 id) {
        if (msg.value != MINT_FEE) revert Payment();
        if (minted >= SEAT_MAX || !_validName(name)) revert MintClosed();
        id = ++minted;
        _roster[id] = Swimmer({owner: msg.sender, name: name, pool: 0, hp: HP_STAT, inSea: false, ended: false, markSet: false, mark: address(0)});
        emit Minted(id, msg.sender, name);
        _payMint(MINT_FEE);
    }

    /// @notice Seat a fish and bind the address that must sign the three samples.
    /// @param id Fish id owned by the caller. A fish can be seated once.
    /// @param stake Attached USDC. Must equal `msg.value` and be at least 1 USDC.
    /// @param mark Sample signer. It may be the owner or a separate session key.
    function register(uint256 id, uint256 stake, address mark) external payable nonReentrant {
        if (msg.value != stake) revert Payment();
        if (stake < STAKE_MIN) revert StakeLow();
        if (mark == address(0)) revert Addr();
        Swimmer storage fish = _fish(id);
        if (fish.owner != msg.sender || fish.inSea || fish.ended || fish.markSet || _seated(msg.sender) || _seatedCount() >= 2) {
            revert RegisterClosed();
        }
        fish.mark = mark;
        fish.markSet = true;
        fish.pool = stake;
        fish.inSea = true;
        if (_seatedCount() == 2) {
            openBout += 1;
            boutOpen = true;
            seatMilli = _nowMs();
            seatHeight = block.number;
        }
        emit Registered(id, openBout, mark);
    }

    /// @notice Return the seated stake. While the other fish is seated, wait 60 seconds.
    function leave(uint256 id) external nonReentrant {
        Swimmer storage fish = _fish(id);
        if (fish.owner != msg.sender || !fish.inSea) revert LeaveClosed();
        if (_otherSeated(id) && _nowMs() < seatMilli + QUIET_MS) revert LeaveClosed();
        if (_otherSeated(id)) boutOpen = false;
        uint256 stake = fish.pool;
        fish.pool = 0;
        fish.inSea = false;
        emit Left(id, stake);
        _send(fish.owner, stake);
    }

    /// @notice Pay one covered kill from six notes, killer then victim, three samples, separated by slashes.
    /// @dev A note is `bout:seq:height:id:x:z:time:secret:sig`. `secret` is 32 lowercase hex chars.
    ///      `sig` is 130 lowercase hex chars, `r || s || v`, an EIP-191 signature of `keccak256(canon(...))`.
    function settle(uint256 id, uint256 target, string calldata pack) external nonReentrant {
        if (!boutOpen || id == target || bytes(pack).length == 0 || bytes(pack).length > PACK_MAX) revert SettleClosed();
        Swimmer storage atk = _fish(id);
        Swimmer storage vic = _fish(target);
        if (atk.owner != msg.sender || !atk.inSea || !vic.inSea || atk.owner == vic.owner || atk.pool < STAKE_MIN || vic.pool < STAKE_MIN) {
            revert SettleClosed();
        }
        Note[2][3] memory got = _parsePack(pack);
        _checkNotes(id, target, got);

        uint256 covered = atk.pool < vic.pool ? atk.pool : vic.pool;
        uint256 excess = vic.pool - covered;
        address victim = vic.owner;
        vic.hp = 0;
        vic.pool = 0;
        vic.inSea = false;
        vic.ended = true;
        boutOpen = false;

        (uint256 killerAmt, uint256 lpAmt, uint256 crewAmt, uint256 buybackAmt) = _splitKill(covered);
        emit Killed(id, target, covered);
        _send(atk.owner, killerAmt);
        _send(lpSink, lpAmt);
        _send(team, crewAmt);
        _send(burn, buybackAmt);
        _send(victim, excess);
    }

    /// @notice Damage for one bite. `floor(bite * 100 / (hpMax + 100))`, at least 1.
    function strike(uint256 bite, uint256 hpMax) public pure returns (uint256) {
        if (bite < 1) bite = 1;
        uint256 dmg = bite * 100 / (hpMax + 100);
        return dmg < 1 ? 1 : dmg;
    }

    /// @notice Payload a mark signs, joined by commas. Numbers are canonical decimals with no leading zeros.
    function canon(uint256 bout, uint256 seq, uint256 height, uint256 id, int256 x, int256 z, uint256 at, string memory secret)
        public
        pure
        returns (string memory)
    {
        return string.concat(
            _u(bout), ",", _u(seq), ",", _u(height), ",", _u(id), ",", _i(x), ",", _i(z), ",", _u(at), ",", secret
        );
    }

    function version() external pure returns (string memory) {
        return "fishduel-arc-2";
    }

    function ownerOf(uint256 id) external view returns (address) {
        return _fish(id).owner;
    }

    function poolOf(uint256 id) external view returns (uint256) {
        return _fish(id).pool;
    }

    function hpOf(uint256 id) external view returns (uint256) {
        return _fish(id).hp;
    }

    function inSea(uint256 id) external view returns (bool) {
        return _fish(id).inSea;
    }

    function ended(uint256 id) external view returns (bool) {
        return _fish(id).ended;
    }

    function markOf(uint256 id) external view returns (address) {
        Swimmer storage fish = _fish(id);
        return fish.markSet ? fish.mark : address(0);
    }

    function nameOf(uint256 id) external view returns (string memory) {
        return _fish(id).name;
    }

    function _checkNotes(uint256 id, uint256 target, Note[2][3] memory got) internal view {
        uint256 hp = HP_STAT;
        uint256 prevH;
        uint256 prevT;
        int256 ax;
        int256 az;
        int256 bx;
        int256 bz;
        uint256 dmg = strike(BITE, HP_STAT);
        for (uint256 i; i < 3; i++) {
            Note memory a = got[i][0];
            Note memory b = got[i][1];
            if (a.bout != openBout || b.bout != openBout || a.seq != i + 1 || b.seq != i + 1) revert BadSample();
            if (a.height != b.height || a.height < seatHeight || a.height > block.number) revert BadSample();
            if (i > 0 && (a.height <= prevH || a.at < prevT + HIT_GAP)) revert BadSample();
            if (a.id != id || b.id != target || !_inBox(a.x, a.z) || !_inBox(b.x, b.z)) revert BadSample();
            if (_gap(a.x, a.z, b.x, b.z) > REACH) revert OutOfRange();
            if (i > 0) {
                uint256 room = _stepMax(a.at - prevT);
                if (_gap(ax, az, a.x, a.z) > room || _gap(bx, bz, b.x, b.z) > room) revert StepTooFar();
            }
            if (!_signed(id, a) || !_signed(target, b)) revert BadSig();
            if (i < 2) {
                if (hp <= dmg) revert BadHp();
                hp -= dmg;
            } else if (hp > dmg || a.at > _nowMs()) {
                revert BadHp();
            }
            prevH = a.height;
            prevT = a.at;
            ax = a.x;
            az = a.z;
            bx = b.x;
            bz = b.z;
        }
    }

    function _signed(uint256 id, Note memory n) internal view returns (bool) {
        Swimmer storage fish = _fish(id);
        if (!fish.markSet || n.id != id || n.sig.length != 65) return false;
        bytes32 digest = keccak256(bytes(canon(n.bout, n.seq, n.height, n.id, n.x, n.z, n.at, n.secret)));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(digest), n.sig);
        return err == ECDSA.RecoverError.NoError && recovered == fish.mark;
    }

    function _parsePack(string memory pack) internal pure returns (Note[2][3] memory got) {
        if (_count(pack, "/") != 6) revert BadNote();
        for (uint256 i; i < 6; i++) {
            got[i / 2][i % 2] = _parseNote(_nth(pack, "/", i));
        }
    }

    function _parseNote(string memory raw) internal pure returns (Note memory n) {
        if (_count(raw, ":") != 9) revert BadNote();
        string memory secret = _nth(raw, ":", 7);
        string memory sigHex = _nth(raw, ":", 8);
        if (bytes(secret).length != 32 || bytes(sigHex).length != 130) revert BadNote();
        n = Note({
            bout: _parseU(_nth(raw, ":", 0)),
            seq: _parseU(_nth(raw, ":", 1)),
            height: _parseU(_nth(raw, ":", 2)),
            id: _parseU(_nth(raw, ":", 3)),
            x: _parseI(_nth(raw, ":", 4)),
            z: _parseI(_nth(raw, ":", 5)),
            at: _parseU(_nth(raw, ":", 6)),
            secret: secret,
            sig: _hex(sigHex)
        });
    }

    /// @dev 60% liquidity, 10% burn, and the remaining 30% to team.
    function _payMint(uint256 fee) internal {
        uint256 lp = fee * 6000 / 10000;
        uint256 crew = fee * 2000 / 10000;
        uint256 ash = fee * 1000 / 10000;
        _send(lpSink, lp);
        _send(team, crew + fee - lp - crew - ash);
        _send(burn, ash);
    }

    /// @dev 80 / 10 / 3 / 3 / 4. Cheer joins team. Dust joins burn.
    function _splitKill(uint256 covered) internal pure returns (uint256 killer, uint256 lp, uint256 crew, uint256 buyback) {
        killer = covered * 80 / 100;
        lp = covered * 10 / 100;
        uint256 teamPart = covered * 3 / 100;
        buyback = covered * 3 / 100;
        uint256 cheer = covered * 4 / 100;
        buyback += covered - killer - lp - teamPart - buyback - cheer;
        crew = teamPart + cheer;
    }

    function _send(address to, uint256 amt) internal {
        if (amt == 0) return;
        (bool ok,) = to.call{value: amt}("");
        if (!ok) revert Payment();
    }

    function _fish(uint256 id) internal view returns (Swimmer storage fish) {
        if (id < 1 || id > minted) revert NoFish();
        fish = _roster[id];
    }

    function _seated(address who) internal view returns (bool) {
        for (uint256 i = 1; i <= minted; i++) {
            if (_roster[i].owner == who && _roster[i].inSea) return true;
        }
        return false;
    }

    function _seatedCount() internal view returns (uint256 n) {
        for (uint256 i = 1; i <= minted; i++) {
            if (_roster[i].inSea) n++;
        }
    }

    function _otherSeated(uint256 id) internal view returns (bool) {
        for (uint256 i = 1; i <= minted; i++) {
            if (i != id && _roster[i].inSea) return true;
        }
        return false;
    }

    function _validName(string calldata name) internal pure returns (bool) {
        bytes calldata b = bytes(name);
        if (b.length < 1 || b.length > 16) return false;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9"))) return false;
        }
        return true;
    }

    function _nowMs() internal view returns (uint256) {
        return block.timestamp * 1000;
    }

    function _inBox(int256 x, int256 z) internal pure returns (bool) {
        return x >= -BOX && x <= BOX && z >= -BOX && z <= BOX;
    }

    function _gap(int256 ax, int256 az, int256 bx, int256 bz) internal pure returns (uint256) {
        uint256 dx = _abs(ax - bx);
        uint256 dz = _abs(az - bz);
        return dx > dz ? dx : dz;
    }

    function _abs(int256 v) internal pure returns (uint256) {
        return uint256(v < 0 ? -v : v);
    }

    function _stepMax(uint256 dt) internal pure returns (uint256) {
        uint256 n = dt / CELL_MS;
        if (n < 1) return 1;
        if (n > STEP_CAP) return STEP_CAP;
        return n;
    }

    function _count(string memory s, bytes1 sep) internal pure returns (uint256 n) {
        bytes memory b = bytes(s);
        if (b.length == 0) return 0;
        n = 1;
        for (uint256 i; i < b.length; i++) {
            if (b[i] == sep) n++;
        }
    }

    function _nth(string memory s, bytes1 sep, uint256 index) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 start;
        uint256 seen;
        for (uint256 i; i <= b.length; i++) {
            if (i == b.length || b[i] == sep) {
                if (seen == index) return _slice(b, start, i);
                seen++;
                start = i + 1;
            }
        }
        revert BadNote();
    }

    function _slice(bytes memory b, uint256 start, uint256 end) internal pure returns (string memory) {
        bytes memory out = new bytes(end - start);
        for (uint256 i; i < out.length; i++) {
            out[i] = b[start + i];
        }
        return string(out);
    }

    function _parseU(string memory s) internal pure returns (uint256 n) {
        bytes memory b = bytes(s);
        if (b.length == 0 || b.length > 78) revert BadNote();
        for (uint256 i; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 48 || c > 57) revert BadNote();
            n = n * 10 + (c - 48);
        }
    }

    function _parseI(string memory s) internal pure returns (int256) {
        bytes memory b = bytes(s);
        if (b.length == 0 || b.length > 20) revert BadNote();
        bool neg;
        uint256 i;
        if (b[0] == "-") {
            neg = true;
            i = 1;
            if (b.length == 1) revert BadNote();
        }
        uint256 n;
        for (; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 48 || c > 57) revert BadNote();
            n = n * 10 + (c - 48);
        }
        if (n > uint256(type(int256).max)) revert BadNote();
        return neg ? -int256(n) : int256(n);
    }

    function _hex(string memory s) internal pure returns (bytes memory) {
        bytes memory b = bytes(s);
        if (b.length % 2 != 0) revert BadHex();
        bytes memory out = new bytes(b.length / 2);
        for (uint256 i; i < b.length; i += 2) {
                out[i / 2] = bytes1((_nibble(b[i]) << 4) | _nibble(b[i + 1]));
        }
        return out;
    }

    function _nibble(bytes1 c) private pure returns (uint8) {
        uint8 u = uint8(c);
        if (u >= 48 && u <= 57) return u - 48;
        if (u >= 97 && u <= 102) return u - 87;
        revert BadHex();
    }

    function _u(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        uint256 x = n;
        uint256 len;
        while (x != 0) {
            len++;
            x /= 10;
        }
        bytes memory b = new bytes(len);
        while (n != 0) {
            len--;
            b[len] = bytes1(uint8(48 + (n % 10)));
            n /= 10;
        }
        return string(b);
    }

    function _i(int256 n) internal pure returns (string memory) {
        if (n == type(int256).min) revert BadNote();
        if (n < 0) return string.concat("-", _u(uint256(-n)));
        return _u(uint256(n));
    }
}
