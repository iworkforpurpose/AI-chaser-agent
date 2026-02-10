/**
 * Boltic Database Client
 * Wraps Boltic's REST API for database operations
 * Boltic stores data in its own cloud database — we interact via HTTP
 */

const { createClient } = require('@boltic/sdk');

class BolticDB {
  constructor() {
    this.apiKey = process.env.BOLTIC_API_KEY;
    this.dbId = process.env.BOLTIC_DATABASE_ID;

    this.client = createClient(this.apiKey);
    // Hint the client to use this database for record ops
    if (this.dbId) {
      this.client.currentDatabase = { databaseId: this.dbId };
    }
  }

  buildWhere(filters = []) {
    if (!filters.length) return undefined;
    const where = {};
    for (const f of filters) {
      const { field, operator, value } = f;
      if (operator === 'eq') where[field] = value;
      else if (operator === 'neq') where[field] = { $ne: value };
      else if (operator === 'gt') where[field] = { $gt: value };
      else if (operator === 'gte') where[field] = { $gte: value };
      else if (operator === 'lt') where[field] = { $lt: value };
      else if (operator === 'lte') where[field] = { $lte: value };
      else if (operator === 'in') where[field] = { $in: value };
      else if (operator === 'contains') where[field] = { $contains: value };
    }
    return where;
  }

  buildSort(sort) {
    if (!sort) return undefined;
    // accepts 'field' or '-field'
    if (typeof sort === 'string') {
      const direction = sort.startsWith('-') ? 'desc' : 'asc';
      const field = sort.startsWith('-') ? sort.slice(1) : sort;
      return [{ field, direction }];
    }
    return sort;
  }

  /**
   * INSERT a record into a Boltic collection
   */
  async insert(collection, data) {
    const res = await this.client.records.insert(collection, data, { db_id: this.dbId });
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'Insert failed');
    return res.data || res;
  }

  /**
   * FIND records with optional filters, sorting, pagination
   * filters: [{ field, operator, value }]
   * operators: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
   */
  async find(collection, { filters = [], sort = null, limit = 100, offset = 0 } = {}) {
    const where = this.buildWhere(filters);
    const sortOpt = this.buildSort(sort);
    const page = Math.floor(offset / limit) + 1;
    const res = await this.client.records.findAll(collection, {
      where,
      sort: sortOpt,
      per_page: limit,
      page,
      db_id: this.dbId,
    });
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'Find failed');
    return res.data || [];
  }

  /**
   * FIND ONE record by ID
   */
  async findById(collection, id) {
    const res = await this.client.records.findOne(collection, id, { db_id: this.dbId });
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'FindById failed');
    return res.data || res;
  }

  /**
   * UPDATE a record by ID
   */
  async update(collection, id, data) {
    const res = await this.client.records.updateById(collection, id, data, { db_id: this.dbId });
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'Update failed');
    return res.data || res;
  }

  /**
   * DELETE a record by ID
   */
  async delete(collection, id) {
    const res = await this.client.records.deleteById(collection, id, { db_id: this.dbId });
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'Delete failed');
    return res.data || res;
  }

  /**
   * COUNT records with optional filters
   */
  async count(collection, filters = []) {
    const where = this.buildWhere(filters);
    const res = await this.client.records.findAll(collection, {
      where,
      per_page: 1,
      page: 1,
      db_id: this.dbId,
    });
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'Count failed');
    return res.pagination?.total_count || (res.data ? res.data.length : 0);
  }

  /**
   * BULK INSERT multiple records at once
   */
  async bulkInsert(collection, records) {
    const res = await this.client.records.insertMany(collection, records, { validation: true }, this.dbId);
    if (res?.error) throw new Error(res.error.meta?.join(', ') || res.error.message || 'Bulk insert failed');
    return res.data || res;
  }

  /**
   * Health check / connection test
   */
  async ping() {
    try {
      await this.client.tables.findAll({ db_id: this.dbId });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

// Export singleton
module.exports = new BolticDB();
