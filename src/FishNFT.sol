// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title FishNFT
/// @author Shoal
/// @notice Shoal fish collection on Arc testnet. This contract is the money surface.
///         Mint, list, buy, cancel, register, and leave move USDC. Swim, bite, heal,
///         upgrade, and lay stay off this contract. No FISH ledger token is issued.
/// @dev Native value is Arc USDC, 18 decimals. 1e18 is 1 USDC.
///      A second mint stays closed until that wallet no longer holds an unplayed fish.
///      Bite stays off this contract, so bouts stay 0 and a wallet keeps one unplayed fish.
contract FishNFT is ERC721, ReentrancyGuard {
    uint256 public constant UNIT = 1e18;
    uint256 public constant STAKE_CEIL = 922337203685477 * 1e12;
    uint256 public constant MAX_PRICE = 1_000_000 * 1e18;
    uint256 public constant PROTOCOL_BPS = 200;
    uint256 public constant MAX_ROYALTY = 1000;

    struct Fish {
        string name;
        string rarity;
        string species;
        string size;
        string trait;
        string image;
        address seller;
        uint256 price;
        uint256 pool;
        uint32 bouts;
        uint16 hp;
        uint16 dodge;
        bool listed;
        bool inMatch;
    }

    address public immutable creator;
    address public immutable upgradeSink;
    address public immutable lpSink;
    address public immutable burnSink;
    address public immutable teamSink;
    address public immutable protocolSink;
    address public immutable seasonSink;
    uint256 public immutable royaltyBps;
    string public imageBase;

    uint256 public minted;
    uint256 public mintPrice = 5 * UNIT;
    uint256 public stakeMin = 10 * UNIT;
    string public portrait;
    address public fishReserve;

    mapping(uint256 id => Fish fish) private _fish;
    mapping(address => uint256) public unplayedOf;
    mapping(address => uint256) public seaOf;

    bool private _desk;

    event Minted(uint256 indexed id, address indexed owner, string name);
    event Listed(uint256 indexed id, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed id);
    event Bought(uint256 indexed id, address indexed buyer, uint256 price);
    event Registered(uint256 indexed id, uint256 stake);
    event Left(uint256 indexed id, uint256 stake);
    event ArtSet(string image);
    event Rolled(uint256 indexed id, uint8 tier);
    event MintFeeSet(uint256 price);
    event StakeMinSet(uint256 floor);
    event ReserveSet(address indexed who);

    error Payment();
    error Pay();
    error Name();
    error Unplayed();
    error Owner();
    error NotListed();
    error OnBook();
    error Match();
    error Price();
    error Self();
    error Fee();
    error Stake();
    error One();
    error Locked();
    error Unknown();
    error Image();
    error Sink();
    error Addr();

    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        string memory images,
        uint256 royalty,
        address upgrade,
        address lp,
        address burn,
        address team,
        address protocol,
        address season
    ) ERC721(collectionName, collectionSymbol) {
        if (!_collectionName(collectionName) || !_symbolOk(collectionSymbol)) revert Name();
        if (!_https(images)) revert Image();
        if (royalty > MAX_ROYALTY) revert Fee();
        _sink(upgrade);
        _sink(lp);
        _sink(burn);
        _sink(team);
        _sink(protocol);
        _sink(season);
        creator = msg.sender;
        upgradeSink = upgrade;
        lpSink = lp;
        burnSink = burn;
        teamSink = team;
        protocolSink = protocol;
        seasonSink = season;
        royaltyBps = royalty;
        imageBase = images;
    }

    function version() external pure returns (string memory) {
        return "fish-arc-5";
    }

    function maxSupply() external pure returns (uint256) {
        return 0;
    }

    function protocolBps() external pure returns (uint256) {
        return PROTOCOL_BPS;
    }

    function stakeCeil() external pure returns (uint256) {
        return STAKE_CEIL;
    }

    /// @notice Mint one fish. The chain rolls the species and the trait. Size is medium.
    /// @dev Two coin flips climb one tier, and only two heads climb. The first other
    ///      pair stops. Odds are Bubble 3/4, Tideblade 3/16, Abysswing 3/64,
    ///      Embermaw 3/256, Aurelion 3/1024, Astravex 1/1024. The next two bits roll
    ///      the trait: swift 1/2, fang 1/4, hide 1/4. Dodge is part of that trait,
    ///      stored in tenths of a sea unit: swift 24, hide 12, fang 4. Hide also
    ///      raises HP to 112. `prevrandao` is block entropy. A minter can bias it.
    ///      This is not a VRF. The image is that tier's model.
    function mint(string calldata fishName) external payable nonReentrant returns (uint256 id) {
        if (msg.value != mintPrice) revert Payment();
        if (unplayedOf[msg.sender] != 0) revert Unplayed();
        if (!_fishName(fishName)) revert Name();
        id = ++minted;
        uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, msg.sender, id, address(this))));
        uint256 tier = _tier(seed);
        string memory rarity = _rarityName(tier);
        string memory trait = _traitName(seed);
        _fish[id] = Fish({
            name: fishName,
            rarity: rarity,
            species: _speciesName(tier),
            size: "medium",
            trait: trait,
            image: _model(rarity),
            seller: address(0),
            price: 0,
            pool: 0,
            bouts: 0,
            hp: _hp("medium", trait),
            dodge: _dodge(trait),
            listed: false,
            inMatch: false
        });
        unplayedOf[msg.sender] = 1;
        _safeMint(msg.sender, id);
        _payMint(msg.value);
        emit Minted(id, msg.sender, fishName);
        emit Rolled(id, uint8(tier));
    }

    /// @notice Escrow this fish and ask for an exact USDC price.
    function list(uint256 id, uint256 price) external nonReentrant {
        if (price == 0 || price > MAX_PRICE) revert Price();
        Fish storage body = _known(id);
        if (ownerOf(id) != msg.sender) revert Owner();
        _guard(body);
        body.listed = true;
        body.seller = msg.sender;
        body.price = price;
        _move(msg.sender, address(this), id);
        emit Listed(id, msg.sender, price);
    }

    /// @notice Change the price of a fish this caller already listed.
    function updatePrice(uint256 id, uint256 price) external {
        if (price == 0 || price > MAX_PRICE) revert Price();
        Fish storage body = _known(id);
        if (!body.listed) revert NotListed();
        if (body.seller != msg.sender) revert Owner();
        body.price = price;
        emit Listed(id, msg.sender, price);
    }

    /// @notice Take the fish back from escrow.
    function cancel(uint256 id) external nonReentrant {
        Fish storage body = _known(id);
        if (!body.listed) revert NotListed();
        address seller = body.seller;
        if (seller != msg.sender) revert Owner();
        body.listed = false;
        body.seller = address(0);
        body.price = 0;
        _move(address(this), seller, id);
        emit Cancelled(id);
    }

    /// @notice Buy a listed fish for its exact price. Protocol and creator are paid here.
    function buy(uint256 id) external payable nonReentrant {
        Fish storage body = _known(id);
        if (!body.listed) revert NotListed();
        address seller = body.seller;
        if (msg.sender == seller) revert Self();
        uint256 price = body.price;
        if (msg.value != price) revert Payment();
        uint256 proto = price * PROTOCOL_BPS / 10_000;
        uint256 royal = price * royaltyBps / 10_000;
        if (proto + royal > price) revert Fee();
        body.listed = false;
        body.seller = address(0);
        body.price = 0;
        if (body.bouts == 0) {
            unplayedOf[seller] -= 1;
            unplayedOf[msg.sender] += 1;
        }
        _move(address(this), msg.sender, id);
        _pay(seller, price - proto - royal);
        _pay(creator, royal);
        _pay(protocolSink, proto);
        emit Bought(id, msg.sender, price);
    }

    /// @notice Lock this fish's stake and sit one fish from this wallet.
    function register(uint256 id) external payable nonReentrant {
        if (msg.value < stakeMin || msg.value > STAKE_CEIL) revert Stake();
        if (ownerOf(id) != msg.sender) revert Owner();
        Fish storage body = _known(id);
        if (body.inMatch) revert Match();
        _guard(body);
        if (seaOf[msg.sender] != 0) revert One();
        body.pool = msg.value;
        body.inMatch = true;
        seaOf[msg.sender] = id;
        emit Registered(id, msg.value);
    }

    /// @notice Return the stake. Combat is not on this contract, so there is no bite lock.
    function leave(uint256 id) external nonReentrant {
        if (ownerOf(id) != msg.sender) revert Owner();
        Fish storage body = _known(id);
        if (!body.inMatch) revert Match();
        uint256 stake = body.pool;
        body.pool = 0;
        body.inMatch = false;
        if (seaOf[msg.sender] == id) seaOf[msg.sender] = 0;
        _pay(msg.sender, stake);
        emit Left(id, stake);
    }

    /// @notice The creator stores one https portrait. It does not replace a fish model.
    function setArt(string calldata image) external {
        if (msg.sender != creator) revert Owner();
        if (!_https(image)) revert Image();
        portrait = image;
        emit ArtSet(image);
    }

    /// @notice The next mint price. The floor is 1 USDC and the ceiling is 1000 USDC.
    function setMintFee(uint256 next) external {
        if (msg.sender != creator) revert Owner();
        if (next < UNIT || next > 1000 * UNIT) revert Fee();
        mintPrice = next;
        emit MintFeeSet(next);
    }

    /// @notice The sea floor. There is no product maximum below the integer ceiling.
    function setStakeMin(uint256 next) external {
        if (msg.sender != creator) revert Owner();
        if (next < UNIT || next > STAKE_CEIL) revert Stake();
        stakeMin = next;
        emit StakeMinSet(next);
    }

    /// @notice Record a reserve address. This does not mint FISH and nothing here can draw it.
    function setFishReserve(address who) external {
        if (msg.sender != creator) revert Owner();
        if (who == address(0)) revert Sink();
        fishReserve = who;
        emit ReserveSet(who);
    }

    function approve(address to, uint256 id) public override {
        Fish storage body = _known(id);
        _guard(body);
        super.approve(to, id);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        Fish storage body = _known(id);
        return string.concat(
            "data:application/json;charset=utf-8,",
            '{"name":"',
            body.name,
            '","description":"Shoal fish","image":"',
            body.image,
            '","animation_url":"',
            body.image,
            '","attributes":[{"trait_type":"Species","value":"',
            body.species,
            '"},{"trait_type":"Size","value":"',
            body.size,
            '"},{"trait_type":"Trait","value":"',
            body.trait,
            '"},{"trait_type":"Rarity","value":"',
            body.rarity,
            '"},{"trait_type":"HP","value":"',
            Strings.toString(body.hp),
            '"},{"trait_type":"Dodge","value":"',
            Strings.toString(body.dodge),
            '"}]}'
        );
    }

    function nameOf(uint256 id) external view returns (string memory) {
        return _known(id).name;
    }

    function rarityOf(uint256 id) external view returns (string memory) {
        return _known(id).rarity;
    }

    function speciesOf(uint256 id) external view returns (string memory) {
        return _known(id).species;
    }

    function sizeOf(uint256 id) external view returns (string memory) {
        return _known(id).size;
    }

    function traitOf(uint256 id) external view returns (string memory) {
        return _known(id).trait;
    }

    function imageOf(uint256 id) external view returns (string memory) {
        return _known(id).image;
    }

    function hpOf(uint256 id) external view returns (uint256) {
        return _known(id).hp;
    }

    function dodgeOf(uint256 id) external view returns (uint256) {
        return _known(id).dodge;
    }

    function boutsOf(uint256 id) external view returns (uint256) {
        return _known(id).bouts;
    }

    function poolOf(uint256 id) external view returns (uint256) {
        return _known(id).pool;
    }

    function priceOf(uint256 id) external view returns (uint256) {
        return _known(id).price;
    }

    function sellerOf(uint256 id) external view returns (address) {
        return _known(id).seller;
    }

    function listed(uint256 id) external view returns (bool) {
        return _known(id).listed;
    }

    function inMatch(uint256 id) external view returns (bool) {
        return _known(id).inMatch;
    }

    /// @notice Ids whose ERC-721 owner is `owner`. A listed fish is held by this contract.
    function tokensOf(address owner) external view returns (uint256[] memory ids) {
        uint256 n = minted;
        uint256 count;
        for (uint256 id = 1; id <= n; ++id) {
            if (_ownerOf(id) == owner) count++;
        }
        ids = new uint256[](count);
        uint256 j;
        for (uint256 id = 1; id <= n; ++id) {
            if (_ownerOf(id) == owner) ids[j++] = id;
        }
    }

    function _update(address to, uint256 id, address auth) internal override returns (address) {
        address from = _ownerOf(id);
        if (from != address(0) && !_desk) {
            Fish storage body = _fish[id];
            if (body.listed || body.inMatch || body.pool != 0) revert Locked();
            if (to == from || to == address(this)) revert Addr();
            if (body.bouts == 0 && to != address(0)) {
                unplayedOf[from] -= 1;
                unplayedOf[to] += 1;
            }
        }
        return super._update(to, id, auth);
    }

    function _payMint(uint256 fee) private {
        uint256 up = fee * 6000 / 10_000;
        uint256 lp = fee * 2000 / 10_000;
        uint256 team = fee * 1000 / 10_000;
        uint256 ash = fee - up - lp - team;
        _pay(upgradeSink, up);
        _pay(lpSink, lp);
        _pay(teamSink, team);
        _pay(burnSink, ash);
    }

    function _pay(address to, uint256 amt) private {
        if (amt == 0) return;
        (bool ok,) = to.call{value: amt}("");
        if (!ok) revert Pay();
    }

    function _move(address from, address to, uint256 id) private {
        _desk = true;
        _transfer(from, to, id);
        _desk = false;
    }

    function _guard(Fish storage body) private view {
        if (body.listed) revert OnBook();
        if (body.inMatch) revert Match();
        if (body.pool != 0) revert Locked();
    }

    function _known(uint256 id) private view returns (Fish storage body) {
        body = _fish[id];
        if (id == 0 || id > minted || bytes(body.name).length == 0) revert Unknown();
    }

    function _sink(address who) private view {
        if (who == address(0) || who == address(this)) revert Sink();
    }

    /// @dev Bits 0–9, two per step. A pair of heads (3) climbs. Any other pair stops.
    function _tier(uint256 seed) private pure returns (uint256 tier) {
        for (uint256 step; step < 5 && tier < 5; ++step) {
            if (((seed >> (step * 2)) & 3) != 3) return tier;
            tier += 1;
        }
    }

    /// @dev Bits 10 and 11. The first tails is swift. Heads then tails is fang. Two heads is hide.
    function _traitName(uint256 seed) private pure returns (string memory) {
        if (((seed >> 10) & 1) == 0) return "swift";
        if (((seed >> 11) & 1) == 0) return "fang";
        return "hide";
    }

    function _rarityName(uint256 tier) private pure returns (string memory) {
        if (tier == 1) return "uncommon";
        if (tier == 2) return "rare";
        if (tier == 3) return "epic";
        if (tier == 4) return "legendary";
        if (tier == 5) return "mythic";
        return "common";
    }

    function _speciesName(uint256 tier) private pure returns (string memory) {
        if (tier == 1) return "Tideblade";
        if (tier == 2) return "Abysswing";
        if (tier == 3) return "Embermaw";
        if (tier == 4) return "Aurelion";
        if (tier == 5) return "Astravex";
        return "Bubble";
    }

    function _model(string memory rarity) private view returns (string memory) {
        return string.concat(imageBase, "/", rarity, ".glb");
    }

    function _hp(string memory size, string memory trait) private pure returns (uint16) {
        uint256 hp = 100;
        if (_is(size, "small")) hp = hp * 88 / 100;
        if (_is(size, "large")) hp = hp * 120 / 100;
        if (_is(trait, "hide")) hp = hp * 112 / 100;
        if (hp < 1) hp = 1;
        return uint16(hp);
    }

    /// @dev Tenths of a sea unit. Swift 2.4, hide 1.2, fang 0.4.
    function _dodge(string memory trait) private pure returns (uint16) {
        if (_is(trait, "swift")) return 24;
        if (_is(trait, "hide")) return 12;
        if (_is(trait, "fang")) return 4;
        return 0;
    }

    function _is(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _fishName(string calldata name) private pure returns (bool) {
        bytes memory raw = bytes(name);
        if (raw.length < 1 || raw.length > 20) return false;
        for (uint256 i; i < raw.length; ++i) {
            bytes1 c = raw[i];
            bool ok = (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A) || (c >= 0x30 && c <= 0x39) || c == 0x20;
            if (!ok) return false;
        }
        return true;
    }

    function _collectionName(string memory name) private pure returns (bool) {
        bytes memory raw = bytes(name);
        if (raw.length == 0 || raw.length > 64) return false;
        for (uint256 i; i < raw.length; ++i) {
            if (raw[i] == "|") return false;
        }
        return true;
    }

    function _symbolOk(string memory symbol_) private pure returns (bool) {
        bytes memory raw = bytes(symbol_);
        if (raw.length == 0 || raw.length > 16) return false;
        for (uint256 i; i < raw.length; ++i) {
            bytes1 c = raw[i];
            bool ok = (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A) || (c >= 0x30 && c <= 0x39);
            if (!ok) return false;
        }
        return true;
    }

    function _https(string memory image) private pure returns (bool) {
        bytes memory raw = bytes(image);
        if (raw.length < 8 || raw.length > 160) return false;
        if (
            raw[0] != "h" || raw[1] != "t" || raw[2] != "t" || raw[3] != "p" || raw[4] != "s" || raw[5] != ":"
                || raw[6] != "/" || raw[7] != "/"
        ) return false;
        for (uint256 i; i < raw.length; ++i) {
            bytes1 c = raw[i];
            if (c == bytes1("|") || c == 0x22 || c == 0x5c || c == 0x0a || c == 0x0d) return false;
        }
        return true;
    }
}
