// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interface/ILP.sol";

contract FreeBet is ERC721Upgradeable, OwnableUpgradeable {
    struct Bet {
        uint128 amount;
        uint64 minOdds;
        uint64 expirationTime;
    }

    ILP public LP;
    string public baseURI;
    address public token;
    uint256 public lockedReserve;
    mapping(uint256 => Bet) public freeBets;
    uint256 public lastTokenId;

    event LpChanged(address indexed newLp);
    event FreeBetMinted(address indexed receiver, uint256 indexed id, Bet bet);
    event FreeBetMintedBatch(address[] receivers, uint256[] ids, Bet[] bets);
    event FreeBetRedeemed(
        address indexed bettor,
        uint256 indexed id,
        uint128 amount
    );

    error NotFreeBetOwner();
    error InsufficientAmount();
    error DifferentArraysLength();
    error WrongToken();
    error InsufficientContractBalance();
    error NonTransferable();
    error BetExpired();
    error OddsTooSmall();
    error BetNotExpired();

    function initialize(address token_) external initializer {
        __ERC721_init("FreeBet", "FBT");
        __Ownable_init();
        if (token_ == address(0)) revert WrongToken();
        token = token_;
    }

    function setLp(address lp) external onlyOwner {
        LP = ILP(lp);
        emit LpChanged(lp);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function getExpiredUnburned(uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory, uint256)
    {
        uint256[] memory ids = new uint256[](count);
        uint256 index;
        uint256 end = start + count;
        Bet storage bet;

        for (uint256 id = start; id < end; id++) {
            bet = freeBets[id];
            if (bet.amount > 0 && bet.expirationTime <= block.timestamp) {
                ids[index++] = id;
            }
        }
        return (ids, index);
    }

    function burnExpired(uint256[] calldata ids) external {
        uint256 burnedAmount;
        uint256 len = ids.length;
        uint256 id;
        Bet storage bet;
        uint128 amount;

        for (uint256 i = 0; i < len; i++) {
            id = ids[i];
            bet = freeBets[id];
            amount = bet.amount;

            if (amount > 0 && bet.expirationTime <= block.timestamp) {
                burnedAmount += amount;
                bet.amount = 0;
                _burn(id);
            } else {
                revert BetNotExpired();
            }
        }

        lockedReserve -= burnedAmount;
    }

    function withdraw(uint128 amount) external onlyOwner {
        _checkInsufficient(amount);

        TransferHelper.safeTransfer(token, msg.sender, amount);
    }

    function mintBatch(address[] calldata receivers, Bet[] calldata bets)
        external
        onlyOwner
    {
        uint256 receiversLength = receivers.length;
        if (receiversLength != bets.length) revert DifferentArraysLength();
        uint256[] memory ids = new uint256[](receiversLength);
        uint256 lastId = lastTokenId;
        uint128 amountsSum;

        for (uint256 i = 0; i < receiversLength; i++) {
            ids[i] = ++lastId;
            amountsSum += bets[i].amount;
            _safeMint(receivers[i], lastId, bets[i]);
        }

        _checkInsufficient(amountsSum);

        lastTokenId = lastId;
        lockedReserve += amountsSum;

        emit FreeBetMintedBatch(receivers, ids, bets);
    }

    function mint(address to, Bet calldata bet) external onlyOwner {
        _checkInsufficient(bet.amount);

        lockedReserve += bet.amount;
        uint256 newId = ++lastTokenId;

        _safeMint(to, newId, bet);
        emit FreeBetMinted(to, newId, bet);
    }

    function redeem(
        uint256 id,
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external returns (uint256) {
        if (ownerOf(id) != msg.sender) revert NotFreeBetOwner();

        Bet storage bet = freeBets[id];
        uint128 betAmount = bet.amount;
        if (betAmount < amount) revert InsufficientAmount();
        if (bet.expirationTime <= block.timestamp) revert BetExpired();
        if (bet.minOdds > minOdds) revert OddsTooSmall();

        lockedReserve -= amount;
        bet.amount -= amount;
        if (betAmount == amount) {
            _burn(id);
        }
        emit FreeBetRedeemed(msg.sender, id, amount);
        TransferHelper.safeApprove(token, address(LP), amount);
        return
            LP.betFor(
                msg.sender,
                conditionId,
                amount,
                outcomeId,
                deadline,
                minOdds
            );
    }

    function _safeMint(
        address to,
        uint256 id,
        Bet calldata bet
    ) internal {
        if (bet.expirationTime <= block.timestamp) revert BetExpired();
        freeBets[id] = bet;
        _safeMint(to, id);
    }

    function _transfer(
        address,
        address,
        uint256
    ) internal pure override {
        revert NonTransferable();
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _checkInsufficient(uint128 amount) private view {
        if (IERC20(token).balanceOf(address(this)) < lockedReserve + amount)
            revert InsufficientContractBalance();
    }
}
