const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

async function hasIndex(queryInterface, tableName, name) {
  if (!await hasTable(queryInterface, tableName)) return false;
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === name);
}

module.exports = {
  async up({ queryInterface, transaction }) {
    if (!await hasTable(queryInterface, 'board_posts')) {
      await queryInterface.createTable('board_posts', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        authorParticipantId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'participants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        title: { type: DataTypes.STRING(150), allowNull: false },
        content: { type: DataTypes.TEXT, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!await hasIndex(queryInterface, 'board_posts', 'board_posts_created_at')) {
      await queryInterface.addIndex('board_posts', ['createdAt'], {
        name: 'board_posts_created_at',
        transaction,
      });
    }
    if (!await hasIndex(queryInterface, 'board_posts', 'board_posts_author_participant_id')) {
      await queryInterface.addIndex('board_posts', ['authorParticipantId'], {
        name: 'board_posts_author_participant_id',
        transaction,
      });
    }

    if (!await hasTable(queryInterface, 'board_profiles')) {
      await queryInterface.createTable('board_profiles', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        participantId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'participants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        gender: { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: false },
        instagramId: { type: DataTypes.STRING(30), allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!await hasIndex(queryInterface, 'board_profiles', 'board_profiles_participant_id_unique')) {
      await queryInterface.addIndex('board_profiles', ['participantId'], {
        name: 'board_profiles_participant_id_unique',
        unique: true,
        transaction,
      });
    }

    if (!await hasTable(queryInterface, 'board_profile_views')) {
      await queryInterface.createTable('board_profile_views', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        viewerParticipantId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'participants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        viewedParticipantId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'participants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        sourcePostId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'board_posts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        sourcePostTitle: { type: DataTypes.STRING(150), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      }, { transaction });
    }
    if (!await hasIndex(queryInterface, 'board_profile_views', 'board_profile_views_pair_unique')) {
      await queryInterface.addIndex('board_profile_views', ['viewerParticipantId', 'viewedParticipantId'], {
        name: 'board_profile_views_pair_unique',
        unique: true,
        transaction,
      });
    }
    if (!await hasIndex(queryInterface, 'board_profile_views', 'board_profile_views_viewed_participant_id')) {
      await queryInterface.addIndex('board_profile_views', ['viewedParticipantId'], {
        name: 'board_profile_views_viewed_participant_id',
        transaction,
      });
    }
  },

  async down({ queryInterface, transaction }) {
    if (await hasTable(queryInterface, 'board_profile_views')) {
      await queryInterface.dropTable('board_profile_views', { transaction });
    }
    if (await hasTable(queryInterface, 'board_profiles')) {
      await queryInterface.dropTable('board_profiles', { transaction });
    }
  },
};
