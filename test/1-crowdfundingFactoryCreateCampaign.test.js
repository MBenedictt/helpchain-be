const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrowdfundingFactory.sol - createCampaign()", function () {
    let CrowdfundingFactory, factory;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
        CrowdfundingFactory = await ethers.getContractFactory("CrowdfundingFactory");
        factory = await CrowdfundingFactory.deploy();
        await factory.waitForDeployment();
    });

    it("should create a new campaign successfully", async function () {
        console.log("\n=== Kasus Uji Owner membuat campaign baru ===");

        await factory.connect(user1).createCampaign(
            "Education Aid",
            "Bantuan pendidikan untuk anak kurang mampu",
            ethers.parseEther("5")
        );

        const campaigns = await factory.getAllCampaigns();
        const createdCampaign = campaigns[0];

        expect(campaigns.length).to.equal(1);
        expect(createdCampaign.campaignAddress).to.properAddress;
        expect(createdCampaign.owner).to.equal(user1.address);

        console.log(`Alamat Campaign Baru: ${createdCampaign.campaignAddress}`);
        console.log(`Pemilik Campaign: ${createdCampaign.owner}`);
        console.log("✅ Test berhasil - Campaign baru berhasil dibuat.\n");
    });
});
