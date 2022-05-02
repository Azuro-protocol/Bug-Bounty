// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "./interface/IAzuroBet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title Azuro bet NFT
contract AzuroBet is OwnableUpgradeable, ERC721Upgradeable, IAzuroBet {
    // Last minted token ID
    uint256 lastTokenId;

    // Mapping from owner to list of owned token IDs
    mapping(address => mapping(uint256 => uint256)) private _ownedTokens;
    // Mapping from token ID to index of the owner tokens list
    mapping(uint256 => uint256) private _ownedTokensIndex;

    string public baseURI;

    // Liquidity pool address
    address public lpAddress;
    // Token ID -> core address
    mapping(uint256 => address) private tokenToCore;

    /**
     * @notice Only permits calls by LP.
     */
    modifier onlyLp() {
        if (msg.sender != lpAddress) revert OnlyLp();
        _;
    }

    function initialize() external virtual initializer {
        __Ownable_init_unchained();
        __ERC721_init("AzuroBet-NFT", "BET");
    }

    /**
     * @dev    See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165Upgradeable, ERC721Upgradeable)
        returns (bool)
    {
        return
            interfaceId == type(IERC721EnumerableUpgradeable).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev    See {IERC721EnumerableUpgradeable-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        return lastTokenId;
    }

    /**
     * @dev    See {IERC721EnumerableUpgradeable-tokenOfOwnerByIndex}.
     */
    function tokenOfOwnerByIndex(address owner, uint256 index)
        public
        view
        override
        returns (uint256)
    {
        require(
            index < super.balanceOf(owner),
            "ERC721: owner index out of bounds"
        );
        return _ownedTokens[owner][index];
    }

    /**
     * @dev    See {IERC721EnumerableUpgradeable-tokenByIndex}.
     * @dev    The function included only to support ERC721EnumerableUpgradeable interface.
     */
    function tokenByIndex(uint256 index)
        public
        view
        override
        returns (uint256)
    {
        require(index < lastTokenId, "ERC721: global index out of bounds");
        return index + 1;
    }

    /**
     * @notice Hook that is called before any token transfer includes minting and burning.
     * @param  from token sender
     * @param  to token recipient
     * @param  tokenId transferring token ID
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId);
        if (from != to) {
            if (from != address(0)) {
                _removeTokenFromOwnerEnumeration(from, tokenId);
            }
            if (to != address(0)) {
                _addTokenToOwnerEnumeration(to, tokenId);
            }
        }
    }

    /**
     * @notice Private function to remove a token from this extension's ownership-tracking data structures.
     * @param  from address representing the previous owner of the given token ID
     * @param  tokenId ID of the token to be removed from the tokens list of the given address
     */
    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId)
        internal
    {
        uint256 lastTokenIndex = super.balanceOf(from) - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId_ = _ownedTokens[from][lastTokenIndex];

            _ownedTokens[from][tokenIndex] = lastTokenId_; // Move the last token to the slot of the to-delete token
            _ownedTokensIndex[lastTokenId_] = tokenIndex; // Update the moved token's index
        }

        // This also deletes the contents at the last position of the array
        delete _ownedTokensIndex[tokenId];
        delete _ownedTokens[from][lastTokenIndex];
    }

    /**
     * @notice Private function to add a token to this extension's ownership-tracking data structures.
     * @param  to address representing the new owner of the given token ID
     * @param  tokenId uint256 ID of the token to be added to the tokens list of the given address
     */
    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) internal {
        uint256 length = super.balanceOf(to);
        _ownedTokens[to][length] = tokenId;
        _ownedTokensIndex[tokenId] = length;
    }

    /**
     * @notice Get IDs of tokens owned by `owner`.
     */
    function getTokensByOwner(address owner)
        external
        view
        returns (uint256[] memory tokenIds)
    {
        uint256 _tokens = super.balanceOf(owner);
        tokenIds = new uint256[](_tokens);
        for (uint256 i = 0; i < _tokens; i++) {
            tokenIds[i] = _ownedTokens[owner][i];
        }
    }

    /**
     * @dev    See {IERC721Upgradeable-ownerOf}.
     */
    function ownerOf(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, IAzuroBet)
        returns (address)
    {
        return ERC721Upgradeable.ownerOf(tokenId);
    }

    /**
     * @dev    LP: See {ERC721Upgradeable-_burn}.
     */
    function burn(uint256 tokenId) external override onlyLp {
        super._burn(tokenId);
    }

    /**
     * @dev    LP: See {ERC721Upgradeable-_mint}.
     */
    function mint(address account, address core) external override onlyLp {
        lastTokenId++;
        tokenToCore[lastTokenId] = core;

        super._mint(account, lastTokenId);
    }

    /**
     * @dev   See {ERC721Upgradeable-_baseURI}.
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    /**
     * @notice Owner: Set `uri` as baseURI.
     * @param  uri new baseURI
     */
    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    /**
     * @notice Owner: Set `lp` as new LP address.
     * @param  lp new LP contract address
     */
    function setLp(address lp) external override onlyOwner {
        lpAddress = lp;
        emit LpChanged(lp);
    }

    /**
     * @notice Get token core address.
     * @param  tokenId ID of token
     * @return core address of core token belongs to
     */
    function getCoreByToken(uint256 tokenId)
        external
        view
        override
        returns (address core)
    {
        return tokenToCore[tokenId];
    }
}
