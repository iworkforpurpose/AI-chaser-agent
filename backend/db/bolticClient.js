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

    const toCondition = (operator, value) => {
      if (operator === 'eq') return value;
      if (operator === 'neq') return { $ne: value };
      if (operator === 'gt') return { $gt: value };
      if (operator === 'gte') return { $gte: value };
      if (operator === 'lt') return { $lt: value };
      if (operator === 'lte') return { $lte: value };
      if (operator === 'in') return { $in: Array.isArray(value) ? value : [value] };
      if (operator === 'contains') return { $ilike: `%${String(value)}%` };
      return undefined;
    };

    const asObjectCondition = (value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ...value };
      }
      return { $eq: value };
    };

    for (const f of filters) {
      const { field, operator, value } = f;
      const condition = toCondition(operator, value);
      if (!field || !condition) continue;

      if (!Object.prototype.hasOwnProperty.call(where, field)) {
        where[field] = condition;
        continue;
      }

      const merged = asObjectCondition(where[field]);
      const incoming = asObjectCondition(condition);
      const markImpossible = () => {
        merged.$in = [];
        delete merged.$eq;
      };

      Object.entries(incoming).forEach(([key, incomingValue]) => {
        if (key === '$eq') {
          if (merged.$eq !== undefined && merged.$eq !== incomingValue) {
            markImpossible();
            return;
          }
          if (Array.isArray(merged.$in)) {
            merged.$in = merged.$in.filter(v => v === incomingValue);
            return;
          }
          if (merged.$ne !== undefined && merged.$ne === incomingValue) {
            markImpossible();
            return;
          }
          if (Array.isArray(merged.$notIn) && merged.$notIn.includes(incomingValue)) {
            markImpossible();
            return;
          }
          merged.$eq = incomingValue;
          return;
        }

        // Preserve AND semantics for repeated "not equals" filters on one field.
        if (key === '$ne') {
          if (merged.$eq !== undefined && merged.$eq === incomingValue) {
            markImpossible();
            return;
          }
          if (Array.isArray(merged.$notIn)) {
            if (!merged.$notIn.includes(incomingValue)) {
              merged.$notIn.push(incomingValue);
            }
            return;
          }
          if (merged.$ne !== undefined) {
            merged.$notIn = [merged.$ne, incomingValue].filter((v, i, arr) => arr.indexOf(v) === i);
            delete merged.$ne;
            return;
          }
        }

        if (key === '$in') {
          const values = Array.isArray(incomingValue) ? incomingValue : [incomingValue];
          if (Array.isArray(merged.$in)) {
            merged.$in = merged.$in.filter(v => values.includes(v));
            return;
          }
          if (merged.$eq !== undefined) {
            if (!values.includes(merged.$eq)) {
              markImpossible();
            }
            return;
          }
        }

        if (key === '$gt' || key === '$gte') {
          const existingStrict = merged.$gt;
          const existingInclusive = merged.$gte;
          if (key === '$gt') {
            if (existingStrict === undefined || incomingValue > existingStrict) {
              merged.$gt = incomingValue;
            }
            if (existingInclusive !== undefined && existingInclusive >= merged.$gt) {
              delete merged.$gte;
            }
          } else {
            if (existingInclusive === undefined || incomingValue > existingInclusive) {
              merged.$gte = incomingValue;
            }
            if (existingStrict !== undefined && incomingValue >= existingStrict) {
              delete merged.$gt;
              merged.$gte = incomingValue;
            }
          }
          return;
        }

        if (key === '$lt' || key === '$lte') {
          const existingStrict = merged.$lt;
          const existingInclusive = merged.$lte;
          if (key === '$lt') {
            if (existingStrict === undefined || incomingValue < existingStrict) {
              merged.$lt = incomingValue;
            }
            if (existingInclusive !== undefined && existingInclusive <= merged.$lt) {
              delete merged.$lte;
            }
          } else {
            if (existingInclusive === undefined || incomingValue < existingInclusive) {
              merged.$lte = incomingValue;
            }
            if (existingStrict !== undefined && incomingValue <= existingStrict) {
              delete merged.$lt;
              merged.$lte = incomingValue;
            }
          }
          return;
        }

        merged[key] = incomingValue;
      });

      where[field] = (Object.keys(merged).length === 1 && Object.prototype.hasOwnProperty.call(merged, '$eq'))
        ? merged.$eq
        : merged;
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
