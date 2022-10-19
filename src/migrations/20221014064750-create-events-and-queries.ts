/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('events', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      address: {
        type: Sequelize.STRING
      },
      block_hash: {
        type: Sequelize.STRING
      },
      block_number: {
        type: Sequelize.BIGINT
      },
      log_index: {
        type: Sequelize.BIGINT
      },
      removed: {
        type: Sequelize.BOOLEAN
      },
      transaction_hash: {
        type: Sequelize.STRING
      },
      transaction_index: {
        type: Sequelize.BIGINT
      },
      transaction_log_index: {
        type: Sequelize.STRING
      },
      event_id: {
        type: Sequelize.STRING
      },
      return_values: {
        type: Sequelize.JSONB
      },
      event: {
        type: Sequelize.STRING
      },
      signature: {
        type: Sequelize.STRING
      },
      raw: {
        type: Sequelize.JSONB
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('queries', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      address: {
        type: Sequelize.STRING
      },
      contract: {
        type: Sequelize.STRING
      },
      event_name: {
        type: Sequelize.STRING
      },
      filter: {
        type: Sequelize.TEXT
      },
      last_block: {
        type: Sequelize.BIGINT
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('query_events', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      event_id: {
        type: Sequelize.INTEGER,
        references: { model: 'events', key: 'id' },
        onDelete: 'cascade',
      },
      query_id: {
        type: Sequelize.INTEGER,
        references: { model: 'queries', key: 'id' },
        onDelete: 'cascade',
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('query_events');
    await queryInterface.dropTable('queries');
    await queryInterface.dropTable('events');
  }
};
