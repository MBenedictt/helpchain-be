const { expect } = require("chai");
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
            ethers.parseEther("10"),
            0 // no deadline
        );
        await crowdfunding.waitForDeployment();

        // Backer memberikan donasi
        await crowdfunding.connect(backer1).fund({
            value: ethers.parseEther("4"),
        });
        await crowdfunding.connect(backer2).fund({
            value: ethers.parseEther("6"),
        });
    });

    /**
     * TEST (a)
     * Backer dapat melakukan refund kapan saja selama masih memiliki kontribusi
     */
    it("should allow backer to refund anytime if contribution exists", async function () {
        console.log("\n=== Kasus Uji (a): Refund karena backer memiliki kontribusi ===");

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
            console.log(
                ` - amount: ${ethers.formatEther(event.args.amount)} ETH`
            );
        } else {
            console.log("⚠️ Event RefundClaimed tidak ditemukan.");
        }

        // Verifikasi kontribusi backer menjadi 0
        const backerData = await crowdfunding.backers(backer1.address);
        expect(backerData.totalContribution).to.equal(0);

        console.log("✅ Test (a) berhasil - Refund sukses untuk backer.\n");
    });

    /**
     * TEST (b)
     * Refund harus gagal jika backer tidak memiliki kontribusi
     */
    it("should revert refund if backer has zero contribution", async function () {
        console.log("\n=== Kasus Uji (b): Refund gagal karena backer tidak memiliki kontribusi ===");

        await expect(
            crowdfunding.connect(outsider).refund()
        ).to.be.revertedWith("Nothing to refund.");

        console.log("✅ Test (b) berhasil - Refund ditolak untuk backer tanpa kontribusi.\n");
    });
});
