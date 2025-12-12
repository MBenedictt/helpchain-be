const { expect, anyValue } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - finalizeWithdrawRequest()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2;

    beforeEach(async function () {
        [owner, backer1, backer2] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            ethers.parseEther("10")
        );
        await crowdfunding.waitForDeployment();

        // Backers fund total 10 ETH
        await crowdfunding.connect(backer1).fund({ value: ethers.parseEther("4") });
        await crowdfunding.connect(backer2).fund({ value: ethers.parseEther("6") });

        // Owner creates withdraw request
        const withdrawAmount = ethers.parseEther("5"); // request 5 ETH
        const votingDuration = 1; // 1 detik
        await crowdfunding.connect(owner).createWithdrawRequest(withdrawAmount, votingDuration);
    });

    // (a) Voting YES ≥ jumlah permintaan → dana dicairkan
    it("should finalize successfully when YES votes are enough", async function () {
        console.log("\n=== Kasus Uji (a): Voting mayoritas YES, pencairan berhasil ===");

        // Backer2 vote YES
        await crowdfunding.connect(backer2).confirmWithdrawRequest(1, true);
        // Backer1 tidak vote

        // Tunggu votingDuration berakhir
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");

        // Cek saldo owner sebelum finalize
        const balanceBefore = await ethers.provider.getBalance(owner.address);

        const tx = await crowdfunding.connect(owner).finalizeWithdrawRequest(1);
        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        // Cek event WithdrawFinalized
        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "WithdrawFinalized")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - requestId: ${event.args.requestId.toString()}`);
            console.log(` - success: ${event.args.success}`);
        } else {
            console.log("⚠️ Event WithdrawFinalized tidak ditemukan.");
        }

        // Verifikasi event success = true
        expect(event.args.success).to.be.true;

        // Verifikasi saldo kontrak berkurang
        const contractBalance = await ethers.provider.getBalance(crowdfunding.target);
        console.log(`Saldo kontrak setelah finalize: ${ethers.formatEther(contractBalance)} ETH`);
        expect(contractBalance).to.equal(ethers.parseEther("5")); // 10 - 5 ETH withdrawn

        // Verifikasi owner menerima dana
        const balanceAfter = await ethers.provider.getBalance(owner.address);
        expect(balanceAfter).to.be.gt(balanceBefore);

        console.log("✅ Test (a) berhasil - Dana dicairkan karena voting mayoritas YES.\n");
    });

    // (b) Voting YES < jumlah permintaan → kampanye gagal
    it("should mark campaign Failed when YES votes are not enough", async function () {
        console.log("\n=== Kasus Uji (b): Voting mayoritas NO, kampanye gagal ===");

        // Backer1 vote NO
        await crowdfunding.connect(backer1).confirmWithdrawRequest(1, false);
        // Backer2 vote NO
        await crowdfunding.connect(backer2).confirmWithdrawRequest(1, false);

        // Tunggu waktu voting selesai
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");

        // Finalize withdraw (should fail)
        const tx = await crowdfunding.connect(owner).finalizeWithdrawRequest(1);
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
            .filter((e) => e && e.name === "WithdrawFinalized")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - requestId: ${event.args.requestId.toString()}`);
            console.log(` - success: ${event.args.success}`);
        }

        // Cek state campaign
        const state = await crowdfunding.state();
        expect(state).to.equal(2); // 0=Active, 1=Completed, 2=Failed
        expect(event.args.success).to.be.false;

        console.log("✅ Test (b) berhasil - Voting tidak mencukupi, campaign gagal.\n");
    });
});
