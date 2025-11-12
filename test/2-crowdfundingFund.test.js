const { expect, anyValue } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - fund()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2;

    beforeEach(async function () {
        [owner, backer1, backer2] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            1000
        );
        await crowdfunding.waitForDeployment();
    });

    // (a) Donasi > 0 ETH
    it("should accept valid donations and update total contributions", async function () {
        const donationAmount = 100;

        console.log("\n=== Kasus Uji (a): Donasi > 0 ETH ===");

        // lakukan transaksi donasi dari backer1
        const tx = await crowdfunding.connect(backer1).fund({ value: donationAmount });
        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        // tampilkan event yang dipicu
        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "DonationReceived")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - backer: ${event.args.backer}`);
            console.log(` - amount: ${event.args.amount.toString()}`);
            console.log(` - timestamp: ${event.args.timestamp.toString()}`);
        } else {
            console.log("⚠️  Event DonationReceived tidak ditemukan.");
        }

        // verifikasi saldo kontrak meningkat
        const contractBalance = await ethers.provider.getBalance(crowdfunding.target);
        console.log(`Saldo kontrak setelah donasi: ${contractBalance.toString()}`);
        expect(contractBalance).to.equal(donationAmount);

        // verifikasi totalContributions bertambah sesuai
        const totalContributions = await crowdfunding.totalContributions();
        console.log(`Total kontribusi tercatat: ${totalContributions.toString()}`);
        expect(totalContributions).to.equal(donationAmount);

        // verifikasi bahwa data backer tercatat
        const backerData = await crowdfunding.backers(backer1.address);
        console.log(`Saldo kontribusi backer: ${backerData.totalContribution.toString()}`);
        expect(backerData.totalContribution).to.equal(donationAmount);

        console.log("✅ Test (a) berhasil - transaksi donasi tercatat dengan benar.\n");
    });

    // (b) Donasi = 0 ETH
    it("should revert if donation amount is zero", async function () {
        console.log("\n=== Kasus Uji (b): Donasi = 0 ETH ===");
        await expect(
            crowdfunding.connect(backer2).fund({ value: 0 })
        ).to.be.revertedWith("Must fund amount greater than 0.");
        console.log("✅ Test (b) berhasil - transaksi ditolak sesuai logika.\n");
    });
});
