const { expect, anyValue } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - confirmWithdrawRequest()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2, outsider;

    beforeEach(async function () {
        [owner, backer1, backer2, outsider] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            1000
        );
        await crowdfunding.waitForDeployment();

        // Fund contract
        await crowdfunding.connect(backer1).fund({ value: 500 });
        await crowdfunding.connect(backer2).fund({ value: 700 });

        // Owner creates withdraw request (valid)
        const withdrawAmount = 300;
        const votingDuration = 60;
        await crowdfunding
            .connect(owner)
            .createWithdrawRequest(withdrawAmount, votingDuration);
    });

    // (a) Backer vote YES
    it("should allow backer to vote YES and emit event", async function () {
        console.log("\n=== Kasus Uji (a): Backer vote YES ===");

        const tx = await crowdfunding.connect(backer1).confirmWithdrawRequest(1, true);
        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        // Decode event
        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "WithdrawConfirmed")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - requestId: ${event.args.requestId.toString()}`);
            console.log(` - backer: ${event.args.backer}`);
            console.log(` - approve: ${event.args.approve}`);
            console.log(` - weight: ${event.args.weight.toString()}`);
        }

        // Verify weight = totalContribution
        const backerData = await crowdfunding.backers(backer1.address);
        expect(event.args.weight).to.equal(backerData.totalContribution);

        // Verify vote stored as YES (1)
        const vote = await crowdfunding.getVote(1, backer1.address);
        expect(vote).to.equal(1);

        console.log("✅ Test (a) berhasil - voting YES tercatat dengan bobot sesuai kontribusi.\n");
    });

    // (b) Backer vote NO
    it("should allow backer to vote NO and record correctly", async function () {
        console.log("\n=== Kasus Uji (b): Backer vote NO ===");

        const tx = await crowdfunding.connect(backer2).confirmWithdrawRequest(1, false);
        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "WithdrawConfirmed")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - requestId: ${event.args.requestId.toString()}`);
            console.log(` - backer: ${event.args.backer}`);
            console.log(` - approve: ${event.args.approve}`);
            console.log(` - weight: ${event.args.weight.toString()}`);
        }

        // Verify NO vote stored (2)
        const vote = await crowdfunding.getVote(1, backer2.address);
        expect(vote).to.equal(2);

        console.log("✅ Test (b) berhasil - voting NO tercatat dengan benar.\n");
    });

    // (c) Non-backer mencoba vote
    it("should revert if non-backer tries to vote", async function () {
        console.log("\n=== Kasus Uji (c): Non-backer mencoba vote ===");

        await expect(
            crowdfunding.connect(outsider).confirmWithdrawRequest(1, true)
        ).to.be.revertedWith("Not a backer.");

        console.log("✅ Test (c) berhasil - Non-backer ditolak sesuai logika.\n");
    });

    // (d) Backer vote dua kali
    it("should revert if backer tries to vote twice", async function () {
        console.log("\n=== Kasus Uji (d): Backer mencoba vote dua kali ===");

        // First vote
        await crowdfunding.connect(backer1).confirmWithdrawRequest(1, true);

        // Second vote attempt
        await expect(
            crowdfunding.connect(backer1).confirmWithdrawRequest(1, false)
        ).to.be.revertedWith("Already confirmed.");

        console.log("✅ Test (d) berhasil - voting kedua ditolak.\n");
    });
});
