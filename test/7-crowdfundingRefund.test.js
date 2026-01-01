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
        const tx = await crowdfunding.connect(backer1).refund();
        const receipt = await tx.wait();

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

        expect(event).to.not.be.undefined;
        expect(event.args.backer).to.equal(backer1.address);
        expect(event.args.amount).to.equal(ethers.parseEther("4"));

        // Verifikasi kontribusi backer menjadi 0
        const backerData = await crowdfunding.backers(backer1.address);
        expect(backerData.totalContribution).to.equal(0);
    });

    /**
     * TEST (b)
     * Refund harus gagal jika backer tidak memiliki kontribusi
     */
    it("should revert refund if backer has zero contribution", async function () {
        await expect(
            crowdfunding.connect(outsider).refund()
        ).to.be.revertedWith("Nothing to refund.");
    });
});
