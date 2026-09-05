"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { v4: uuidv4 } = await import("uuid");

    const WithdrawMethods = [
      {
        id: 'd71c4c1a-1d5b-4b2a-8c88-5c5e5f5f5f01',
        title: 'Indian Bank Transfer',
        processingTime: '1-3 Business Days',
        instructions: 'Enter your bank account details below. Ensure the account name matches your registered identity for security compliance.',
        image: null,
        fixedFee: 0.0,
        percentageFee: 0.0,
        minAmount: 500.0,
        maxAmount: 500000.0,
        status: true,
        customFields: JSON.stringify([
          { name: 'accountHolderName', title: 'Account Holder Name', type: 'text', required: true },
          { name: 'bankAccountNumber', title: 'Bank Account Number', type: 'text', required: true },
          { name: 'bankName', title: 'Bank Name', type: 'text', required: true },
          { name: 'ifscCode', title: 'IFSC Code', type: 'text', required: true }
        ])
      },
      {
        id: 'd71c4c1a-1d5b-4b2a-8c88-5c5e5f5f5f02',
        title: 'Tether USDT (TRC-20)',
        processingTime: '10-30 Minutes',
        instructions: 'Provide your Tether USDT TRC-20 wallet address. Send only using the Tron (TRC-20) network. Other network tokens will be permanently lost.',
        image: '/img/crypto/usdt.webp',
        fixedFee: 1.0,
        percentageFee: 0.0,
        minAmount: 10.0,
        maxAmount: 100000.0,
        status: true,
        customFields: JSON.stringify([
          { name: 'usdtTrc20WalletAddress', title: 'USDT TRC-20 Wallet Address', type: 'text', required: true }
        ])
      },
      {
        id: 'd71c4c1a-1d5b-4b2a-8c88-5c5e5f5f5f03',
        title: 'Tether USDT (ERC-20)',
        processingTime: '10-30 Minutes',
        instructions: 'Provide your Tether USDT ERC-20 wallet address. Send only using the Ethereum (ERC-20) network. Other network tokens will be permanently lost.',
        image: '/img/crypto/usdt.webp',
        fixedFee: 5.0,
        percentageFee: 0.0,
        minAmount: 20.0,
        maxAmount: 100000.0,
        status: true,
        customFields: JSON.stringify([
          { name: 'usdtErc20WalletAddress', title: 'USDT ERC-20 Wallet Address', type: 'text', required: true }
        ])
      },
      {
        id: 'd71c4c1a-1d5b-4b2a-8c88-5c5e5f5f5f04',
        title: 'Bitcoin (BTC)',
        processingTime: '30-60 Minutes',
        instructions: 'Provide your Bitcoin wallet address. Ensure the address format is correct to avoid transaction failure or loss of funds.',
        image: '/img/crypto/btc.webp',
        fixedFee: 0.0002,
        percentageFee: 0.0,
        minAmount: 15.0,
        maxAmount: 50000.0,
        status: true,
        customFields: JSON.stringify([
          { name: 'btcWalletAddress', title: 'BTC Wallet Address', type: 'text', required: true }
        ])
      },
      {
        id: 'd71c4c1a-1d5b-4b2a-8c88-5c5e5f5f5f05',
        title: 'Ethereum (ETH)',
        processingTime: '10-30 Minutes',
        instructions: 'Provide your Ethereum wallet address. Make sure it is an ERC-20 address compatible with receiving standard ETH.',
        image: '/img/crypto/eth.webp',
        fixedFee: 0.003,
        percentageFee: 0.0,
        minAmount: 20.0,
        maxAmount: 50000.0,
        status: true,
        customFields: JSON.stringify([
          { name: 'ethWalletAddress', title: 'ETH Wallet Address', type: 'text', required: true }
        ])
      },
      {
        id: 'd71c4c1a-1d5b-4b2a-8c88-5c5e5f5f5f06',
        title: 'UPI Transfer',
        processingTime: '10-30 Minutes',
        instructions: 'Enter your registered UPI ID (VPA) and Account Holder Name. Ensure the name matches your verification profile to avoid processing delays.',
        image: null,
        fixedFee: 0.0,
        percentageFee: 0.0,
        minAmount: 100.0,
        maxAmount: 100000.0,
        status: true,
        customFields: JSON.stringify([
          { name: 'accountHolderName', title: 'Account Holder Name', type: 'text', required: true },
          { name: 'upiId', title: 'UPI ID (VPA)', type: 'text', required: true, placeholder: 'example@upi' }
        ])
      }
    ];

    // Fetch existing withdraw method titles to compare against
    const existingMethods = await queryInterface.sequelize.query(
      "SELECT title FROM withdraw_method",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const existingTitles = new Set(
      existingMethods.map((m) => m.title)
    );

    // Filter out ones that already exist in the database by title
    const newMethods = WithdrawMethods.filter(
      (m) => !existingTitles.has(m.title)
    ).map((m) => {
      const processed = { ...m };
      processed.createdAt = new Date();
      processed.updatedAt = new Date();
      return processed;
    });

    if (newMethods.length > 0) {
      console.log(`Inserting ${newMethods.length} new withdrawal methods.`);
      await queryInterface.bulkInsert("withdraw_method", newMethods, {});
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("withdraw_method", null, {});
  },
};
