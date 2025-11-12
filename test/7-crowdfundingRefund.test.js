const { expect, anyValue } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - refund()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2, outsider;

    beforeEach(async function () {
        [owner, backer1, backer2, outsider] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            ethers.parseEther("10")
        );
        await crowdfunding.waitForDeployment();

        // Tambahkan dana ke campaign
        await crowdfunding.connect(backer1).fund({ value: ethers.parseEther("4") });
        await crowdfunding.connect(backer2).fund({ value: ethers.parseEther("6") });

        // Owner buat withdraw request (5 ETH)
        await crowdfunding
            .connect(owner)
            .createWithdrawRequest(ethers.parseEther("5"), 1);
    });

    // (a) Campaign gagal (state = Failed)
    it("should allow refund when campaign failed", async function () {
        console.log("\n=== Kasus Uji (a): Refund karena campaign gagal ===");

        // Voting mayoritas NO agar gagal
        await crowdfunding.connect(backer1).confirmWithdrawRequest(1, false);
        await crowdfunding.connect(backer2).confirmWithdrawRequest(1, false);

        // Tunggu waktu voting berakhir
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");

        // Finalize (akan gagal)
        await crowdfunding.connect(owner).finalizeWithdrawRequest(1);

        // Refund oleh backer1
        const tx = await crowdfunding.connect(backer1).refund();
        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        // Ambil event RefundClaimed
        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "RefundClaimed")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - backer: ${event.args.backer}`);
            console.log(` - amount: ${ethers.formatEther(event.args.amount)} ETH`);
        }

        // Verifikasi totalContribution jadi 0
        const backerData = await crowdfunding.backers(backer1.address);
        expect(backerData.totalContribution).to.equal(0);

        console.log("✅ Test (a) berhasil - Refund sukses karena campaign gagal.\n");
    });

    // (b) Backer pernah vote NO
    it("should allow refund if backer voted NO even if campaign still active", async function () {
        console.log("\n=== Kasus Uji (b): Refund karena backer vote NO ===");

        // Backer1 vote NO, backer2 YES
        await crowdfunding.connect(backer1).confirmWithdrawRequest(1, false);
        await crowdfunding.connect(backer2).confirmWithdrawRequest(1, true);

        // Belum finalize → masih state Active
        const stateBefore = await crowdfunding.state();
        expect(stateBefore).to.equal(0);

        // Backer1 refund karena pernah vote NO
        const tx = await crowdfunding.connect(backer1).refund();
        const receipt = await tx.wait();

        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "RefundClaimed")[0];

        console.log(`Event emitted: ${event.name}`);
        console.log(` - backer: ${event.args.backer}`);
        console.log(` - amount: ${ethers.formatEther(event.args.amount)} ETH`);

        const backerData = await crowdfunding.backers(backer1.address);
        expect(backerData.totalContribution).to.equal(0);

        console.log("✅ Test (b) berhasil - Backer dengan vote NO dapat refund.\n");
    });

    // (c) Backer tanpa hak refund mencoba refund
    it("should revert if backer has no refund rights", async function () {
        console.log("\n=== Kasus Uji (c): Refund gagal karena tidak memenuhi syarat ===");

        // Belum voting apa pun, campaign masih active
        await expect(
            crowdfunding.connect(backer2).refund()
        ).to.be.revertedWith("Refund not allowed.");

        console.log("✅ Test (c) berhasil - Refund ditolak untuk backer tanpa hak.\n");
    });
});
