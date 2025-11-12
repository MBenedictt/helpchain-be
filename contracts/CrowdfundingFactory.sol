// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/* Jadi ini factory namanya, gunanya supaya kalo orang mau buat campaign, 
tinggal manggil function aja nti di FE gausa deploy manual kek biasae */

import { Crowdfunding } from "./Crowdfunding.sol";

contract CrowdfundingFactory {
    address public owner;
    bool public paused;

    struct Campaign {
        address campaignAddress;
        address owner;
        string name;
        uint256 creationTime;
    }

    Campaign[] public campaigns;

    // pake array karena satu user bisa buat banyak campaign jadi lek dikasi address bakal return semua campaignnya user tsb.
    mapping (address => Campaign[]) public userCampaigns;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner.");
        _;
    }

    modifier notPaused() {
        require(!paused, "Factory is paused.");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createCampaign(
        string memory _name,
        string memory _description,
        uint256 _goal
    ) external notPaused {
        // basic OOP lupa ak, pokoke ini deploy smart contract crowdfunding baru
        Crowdfunding newCampaign = new Crowdfunding(
            msg.sender,
            _name,
            _description,
            _goal
        );

        address campaignAddress = address(newCampaign);

        // ini campaign structnya, cuma buat info saja kalo nanti di getAllCampaigns
        Campaign memory campaign = Campaign ({
            campaignAddress: campaignAddress,
            owner: msg.sender,
            name: _name,
            creationTime: block.timestamp
        });

        campaigns.push(campaign);
        userCampaigns[msg.sender].push(campaign);
    }

    function getUserCampaigns(address _user) external view returns (Campaign[] memory) {
        return userCampaigns[_user];
    }

    function getAllCampaigns() external view returns (Campaign[] memory) {
        return campaigns;
    }

    function togglePause() public onlyOwner {
        paused = !paused; // paused akan di set sesuai kebalikannya
    }
}