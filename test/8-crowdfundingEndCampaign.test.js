const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - endCampaign()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2;

    beforeEach(async function () {
        [owner, backer1, backer2] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            ethers.parseEther("10") // goal = 10 ETH
        );
        await crowdfunding.waitForDeployment();
    });

    // (a) Completed
    it("should mark campaign as Completed when goal reached and all funds withdrawn", async function () {
        console.log("\n=== Kasus Uji (a): Campaign Completed karena goal tercapai ===");

        await crowdfunding.connect(backer1).fund({ value: ethers.parseEther("4") });
        await crowdfunding.connect(backer2).fund({ value: ethers.parseEther("6") });

        const goal = await crowdfunding.goal();
        const totalBefore = await crowdfunding.totalContributions();
        console.log(`Goal: ${ethers.formatEther(goal)} ETH`);
        console.log(`TotalContributions sebelum endCampaign: ${ethers.formatEther(totalBefore)} ETH`);

        await crowdfunding
            .connect(owner)
            .createWithdrawRequest(ethers.parseEther("10"), 1);

        await crowdfunding.connect(backer1).confirmWithdrawRequest(1, true);
        await crowdfunding.connect(backer2).confirmWithdrawRequest(1, true);

        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");

        await crowdfunding.connect(owner).finalizeWithdrawRequest(1);

        const totalAfterFinalize = await crowdfunding.totalContributions();
        console.log(`TotalContributions setelah finalize: ${ethers.formatEther(totalAfterFinalize)} ETH`);

        await crowdfunding.connect(owner).endCampaign();
        const state = await crowdfunding.state();
        expect(state).to.equal(1);

        console.log("State akhir: Completed (1)");
        console.log("✅ Test (a) berhasil - Campaign Completed.\n");
    });

    // (b) Masih ada dana → revert
    it("should revert if trying to end campaign while funds remain", async function () {
        console.log("\n=== Kasus Uji (b): Gagal end campaign karena masih ada dana ===");

        await crowdfunding.connect(backer1).fund({ value: ethers.parseEther("5") });

        const goal = await crowdfunding.goal();
        const total = await crowdfunding.totalContributions();
        console.log(`Goal: ${ethers.formatEther(goal)} ETH`);
        console.log(`TotalContributions: ${ethers.formatEther(total)} ETH`);

        await expect(crowdfunding.connect(owner).endCampaign()).to.be.revertedWith(
            "All funds must be withdrawn."
        );

        console.log("✅ Test (b) berhasil - Tidak bisa end campaign sebelum dana kosong.\n");
    });

    // (c) Tidak ada dana sejak awal
    it("should allow endCampaign() and mark as Failed if goal not reached but totalContributions already zero", async function () {
        console.log("\n=== Kasus Uji (c): Campaign Failed - goal tidak tercapai namun saldo kosong ===");

        const goal = await crowdfunding.goal();
        const totalContrib = await crowdfunding.totalContributions();

        console.log(`Goal: ${ethers.formatEther(goal)} ETH`);
        console.log(`TotalContributions: ${ethers.formatEther(totalContrib)} ETH`);

        expect(totalContrib).to.equal(0);

        await crowdfunding.connect(owner).endCampaign();
        const state = await crowdfunding.state();
        expect(state).to.equal(2);

        console.log("State akhir: Failed (2)");
        console.log("✅ Test (c) berhasil - Campaign Failed tanpa dana dari awal.\n");
    });

    // (d) Ada donasi tapi owner paksa endCampaign → revert
    it("should revert if owner tries to end campaign while donations exist", async function () {
        console.log("\n=== Kasus Uji (d): Owner mencoba end campaign dengan dana masih tersisa ===");

        await crowdfunding.connect(backer1).fund({ value: ethers.parseEther("3") });

        const goal = await crowdfunding.goal();
        const totalContrib = await crowdfunding.totalContributions();
        console.log(`Goal: ${ethers.formatEther(goal)} ETH`);
        console.log(`TotalContributions: ${ethers.formatEther(totalContrib)} ETH`);

        await expect(crowdfunding.connect(owner).endCampaign()).to.be.revertedWith(
            "All funds must be withdrawn."
        );

        console.log("✅ Test (d) berhasil - End campaign ditolak karena masih ada dana.\n");
    });
});
