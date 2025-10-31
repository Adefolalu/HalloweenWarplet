// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Halloween Warplet
 * @notice ERC721 collection for Cutified Warplets. Supports origin tracking and a payable mint fee.
 * @dev Designed for deployment on Base mainnet. Uses ERC721URIStorage for per-token metadata URIs.
 */
contract Halloween Warplets is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using Strings for uint256;

    struct Origin {
        address originContract;
        uint256 originTokenId;
    }

    // tokenId => origin
    mapping(uint256 => Origin) public originOf;

    // Incremental token id counter
    uint256 private _nextTokenId = 1;

    // Mint fee in wei (default 0.00037 ETH)
    uint256 public cutifyingFee = 370_000_000_000_000; // 0.00037 ether

    event Cutified(
        uint256 indexed tokenId,
        address indexed originContract,
        uint256 indexed originTokenId,
        address minter
    );

    error IncorrectFee();

    constructor(address initialOwner) ERC721("Halloween Warplets", "HWPLT") Ownable(initialOwner) {}

    /**
     * @notice Mint a Cutified NFT.
     * @param originContract Address of the original Warplet collection
     * @param originTokenId Token id of the original Warplet (usually user's FID)
     * @param metadataURI Full token URI (ipfs://...)
     * @return tokenId Newly minted token id
     */
    function mint(
        address originContract,
        uint256 originTokenId,
        string calldata metadataURI
    ) external payable nonReentrant returns (uint256 tokenId) {
        if (msg.value != cutifyingFee) revert IncorrectFee();

        tokenId = _nextTokenId++;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        originOf[tokenId] = Origin({originContract: originContract, originTokenId: originTokenId});

        emit Cutified(tokenId, originContract, originTokenId, msg.sender);
    }

    /**
     * @notice Set the mint fee.
     * @param newFee New fee in wei
     */
    function setCutifyingFee(uint256 newFee) external onlyOwner {
        cutifyingFee = newFee;
    }

    /**
     * @notice Withdraw contract balance to owner.
     */
    function withdraw() external onlyOwner nonReentrant {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok, "WITHDRAW_FAILED");
    }

    // The following functions are overrides required by Solidity.

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
