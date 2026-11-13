// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Pixels is ERC721, Ownable {

    uint256 public _gridsize = 1000; //will change to 1000 eventually.....
    uint256 public _totalPixels = _gridsize * _gridsize;
    uint256 public _pixelPrice = 400000000000000000; // approx 1usd
    string public _baseURIextended;

    // bytes3[] public _pixelColours = new bytes3[](_gridsize);
    mapping(uint256 => bytes3) public _pixelColours;
    mapping(uint256 => bool) public _pixelOwned;
    mapping(uint256 => string) public _pixelURL;

    event PixelMinted (uint date, address indexed to, uint256 pixelId);
    event PixelColourChanged ( address owner, bytes3 newColour, uint256 pixelId , string newURL);

    constructor() ERC721("Pixels", "PIX") {
        _baseURIextended = "https://polypaint.io/nft/";
    }

    function setTokenPrice(uint256 _newPrice) external onlyOwner {
        _pixelPrice = _newPrice;
    }

    function mint(uint256 _pixelId, bytes3 _newColour, string memory _customURL) public payable {
        require(!_pixelOwned[_pixelId], "Pixel is already owned");
        require(_pixelId < _totalPixels, "Pixel out of range");
        require(msg.value >= _pixelPrice, "No/ Insufficient fees provided");
        _pixelOwned[_pixelId] = true;
        _pixelColours[_pixelId] = _newColour;
        _pixelURL[_pixelId]  = _customURL;
        _safeMint(msg.sender, _pixelId);
        emit PixelMinted(block.timestamp, msg.sender, _pixelId);
        emit PixelColourChanged(msg.sender, _newColour, _pixelId, _customURL);
    }

    function mint(uint256 _pixelId, bytes3 _newColour) external payable {
        mint(_pixelId, _newColour, "");
    }

    function mint(uint256 _pixelId, string memory _customURL) external payable {
        mint(_pixelId, 0x111111, _customURL);
    }

    function mint(uint256 _pixelId) external payable {
        mint(_pixelId, 0x111111, "");
    }

    function mintMultiple(uint256[] memory _pixelIds, bytes3[] memory _newColours, string memory _customURL) public payable {
        require(msg.value >= _pixelIds.length * _pixelPrice, "No/ Insufficient fees provided");
        require(_pixelIds.length == _newColours.length, "Arrays of inconsistent length");
        for (uint256 i = 0; i < _pixelIds.length; i++) {
            mint(_pixelIds[i], _newColours[i], _customURL);
        }
    }

    function getBalance() public view returns(uint256){
        return address(this).balance;
    }

     function withdrawAmount(uint256 amount) external onlyOwner {
         require(amount <= getBalance(), "Insufficient funds");
         payable(msg.sender).transfer(amount);
     }

    //function change pixel colour |||ERC721.ownerOf(tokenId)
    function changePixelColour(uint256 _pixelId, bytes3 _newColour, string memory _newURL) public {
        require(_pixelId < _totalPixels, "Pixel id out of range");
        require(ownerOf(_pixelId) == msg.sender, "Sender is not Pixel owner");
        if (keccak256(abi.encodePacked(_pixelURL[_pixelId])) != keccak256(abi.encodePacked('/#'))) {
            _pixelURL[_pixelId] = _newURL;
        }
        _pixelColours[_pixelId] = _newColour;
        emit PixelColourChanged(msg.sender, _newColour, _pixelId, _newURL);
    }

    function changePixelColourMultiple(uint256[] memory _pixelIds, bytes3[] memory _newColours, string memory _newURL) external {
        require(_pixelIds.length == _newColours.length, "Arrays of inconsistent length");
        for (uint256 i = 0; i < _pixelIds.length; i++) {
            changePixelColour(_pixelIds[i], _newColours[i], _newURL);
        }
    }

    function getPixelColour(uint256 _pixelId) public view returns (bytes3) {
        require(_pixelId < _totalPixels, "Pixel id out of range");
        if(_pixelOwned[_pixelId]) {
            return _pixelColours[_pixelId];
        } else {
            return 0x000001;
        }
    }

    function getPixelCustomURL(uint256 _pixelId) public view returns (string memory) {
        require(_pixelId < _totalPixels, "Pixel id out of range");
        if(_pixelOwned[_pixelId]) {
            return _pixelURL[_pixelId];
        } else {
            return "";
        }
    }

    function isPixelOwned(uint256 _pixelId) public view returns (bool) {
        require(_pixelId < _totalPixels, "Pixel id out of range");
        return _pixelOwned[_pixelId];
    }

    function setBaseURI(string memory baseURI_) external onlyOwner() {
        _baseURIextended = baseURI_;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURIextended;
    }

    function contractURI() public pure returns (string memory) {
        return "https://polypaint.io/contract_metadata";
    }

}
