// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol";

interface IAzuroBet is IERC721EnumerableUpgradeable {
    function ownerOf(uint256 tokenId) external view override returns (address);

    function burn(uint256 id) external;

    function mint(address account, address core) external;

    function setLp(address lp) external;

    function getCoreByToken(uint256 tokenId)
        external
        view
        returns (address core);

    event LpChanged(address lp);

    error OnlyLp();
}
