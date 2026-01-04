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

    /**
     * TEST 1
     * Membuat campaign tanpa batas waktu (non-berjangka)
     */
    it("should create a non-time-limited campaign successfully", async function () {
        console.log("\n=== Kasus Uji: Membuat campaign tanpa batas waktu ===");

        await factory.connect(user1).createCampaign(
            "Education Aid",
            "Bantuan pendidikan untuk anak kurang mampu",
            ethers.parseEther("5"),
            0 // duration = 0 → no deadline
        );

        const campaigns = await factory.getAllCampaigns();
        const createdCampaign = campaigns[0];

        expect(campaigns.length).to.equal(1);
        expect(createdCampaign.campaignAddress).to.properAddress;
        expect(createdCampaign.owner).to.equal(user1.address);

        console.log(`Alamat Campaign: ${createdCampaign.campaignAddress}`);
        console.log(`Pemilik Campaign: ${createdCampaign.owner}`);
        console.log("✅ Test berhasil - Campaign tanpa batas waktu berhasil dibuat.\n");
    });

    /**
     * TEST 2
     * Membuat campaign berjangka (memiliki deadline)
     */
    it("should create a time-limited campaign with valid deadline", async function () {
        console.log("\n=== Kasus Uji: Membuat campaign berjangka ===");

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const deadlineTimestamp = now + 7 * 24 * 60 * 60;

        await factory.connect(user1).createCampaign(
            "Disaster Relief",
            "Bantuan korban bencana alam",
            ethers.parseEther("10"),
            deadlineTimestamp
        );

        const campaigns = await factory.getAllCampaigns();
        const createdCampaign = campaigns[0];

        const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        const campaign = Crowdfunding.attach(createdCampaign.campaignAddress);

        const deadline = await campaign.deadline();

        expect(deadline).to.equal(BigInt(deadlineTimestamp));
        expect(deadline).to.be.gt(now);

        console.log(`Alamat Campaign Baru: ${createdCampaign.campaignAddress}`);
        console.log(`Pemilik Campaign: ${createdCampaign.owner}`);
        console.log(`Deadline Campaign: ${deadline.toString()}`);
        console.log("✅ Test berhasil - Campaign berjangka berhasil dibuat dengan deadline valid.\n");
    });
});
